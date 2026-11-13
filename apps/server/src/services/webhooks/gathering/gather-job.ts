import type { EntityManager } from "@mikro-orm/sql"
import {
  ShoppingItem,
  ShoppingList,
  WebhookEvent,
} from "../../../database/entities/index.ts"
import { inHouseholdTransaction } from "../../../database/transactions.ts"
import type { JobHandler } from "../../jobs/runner.ts"
import type { Actor } from "../actor.ts"
import type { EventData, ListTally } from "../payloads.ts"
import { sendEvent } from "../record.ts"
import {
  GATHERED_EVENTS,
  WEBHOOK_GATHER_JOB,
  type GatheredEventType,
  type GatheredPart,
} from "./gathering.ts"

// The job that merges a household's gathered changes of one type and sends
// them: one event for each person who made them, so `by` stays exact and
// an n8n flow can still ignore the changes it made itself.

type Merge<T extends GatheredEventType> = (
  em: EntityManager,
  parts: GatheredPart<T>[]
) => Promise<EventData<T>>

const MERGES: { [T in GatheredEventType]: Merge<T> } = {
  "plan.changed": mergePlanChanges,
  "list.changed": mergeListChanges,
  "pantry.changed": mergePantryChanges,
}

/** One event from the parts of many changes, with exact counts. */
export function mergeParts<T extends GatheredEventType>(
  em: EntityManager,
  type: T,
  parts: GatheredPart<T>[]
): Promise<EventData<T>> {
  const merge: Merge<T> = MERGES[type]
  return merge(em, parts)
}

async function mergePlanChanges(
  _em: EntityManager,
  parts: GatheredPart<"plan.changed">[]
): Promise<EventData<"plan.changed">> {
  return {
    days: sortedOnce(parts.flatMap((part) => part.days ?? [])),
    pools: sortedOnce(parts.flatMap((part) => part.pools ?? [])),
    ...addUp(parts, ["added", "moved", "changed", "removed"]),
  }
}

async function mergeListChanges(
  em: EntityManager,
  parts: GatheredPart<"list.changed">[]
): Promise<EventData<"list.changed">> {
  const listIds = parts.flatMap((part) => part.lists)
  return {
    lists: await tallies(em, listIds),
    ...addUp(parts, ["added", "checked", "unchecked", "changed", "removed"]),
  }
}

async function mergePantryChanges(
  _em: EntityManager,
  parts: GatheredPart<"pantry.changed">[]
): Promise<EventData<"pantry.changed">> {
  return addUp(parts, ["added", "usedUp", "moved", "changed", "removed"])
}

/** Each count, added up over every part: a part without one counts none. */
function addUp<const K extends string>(
  parts: Partial<Record<NoInfer<K>, number>>[],
  counts: readonly K[]
): Record<K, number> {
  const totals = {} as Record<K, number>
  for (const count of counts) {
    totals[count] = 0
    for (const part of parts) {
      totals[count] += part[count] ?? 0
    }
  }
  return totals
}

/** Days as YYYY-MM-DD, each once, earliest first. */
function sortedOnce(days: string[]) {
  return [...new Set(days)].sort()
}

/**
 * Each list touched, once, as it is now rather than as it was at each
 * change. A list deleted since is left out.
 */
async function tallies(
  em: EntityManager,
  listIds: string[]
): Promise<ListTally[]> {
  const ids = [...new Set(listIds)]
  const lists = await em.find(ShoppingList, { id: { $in: ids } })
  const byId = new Map(lists.map((list) => [list.id, list]))

  const told: ListTally[] = []
  for (const id of ids) {
    const list = byId.get(id)
    if (!list) continue

    told.push({
      id: list.id,
      name: list.name,
      left: await em.count(ShoppingItem, { list: list.id, checked: false }),
      checked: await em.count(ShoppingItem, { list: list.id, checked: true }),
    })
  }
  return told
}

/** One person's changes in a window: who made them, and what each did. */
type Changes = {
  actor: Actor
  parts: Record<string, unknown>[]
  /** When the last of them was made, which is when their event happened. */
  lastAt: Date
}

/**
 * The rows, by who made them (`by`, `via` and `key`), in the order each
 * first appears. Each row's payload is its context and then its part.
 */
function byWho(rows: WebhookEvent[]): Changes[] {
  const groups = new Map<string, Changes>()
  for (const row of rows) {
    const { household: _household, by, via, key, ...part } = row.payload
    const actor = { by, via, key } as Actor
    const who = JSON.stringify([
      actor.by?.id ?? null,
      actor.via,
      actor.key?.id ?? null,
    ])

    let group = groups.get(who)
    if (!group) {
      group = { actor, parts: [], lastAt: row.createdAt }
      groups.set(who, group)
    }
    group.parts.push(part)
    if (row.createdAt > group.lastAt) group.lastAt = row.createdAt
  }
  return [...groups.values()]
}

/** The type a job's payload says to merge; any other fails the job. */
function gatheredType(payload: Record<string, unknown>): GatheredEventType {
  const type = GATHERED_EVENTS.find((gathered) => gathered === payload.type)
  if (!type) {
    throw new Error(`Merran doesn't gather "${String(payload.type)}" events.`)
  }
  return type
}

/**
 * Merges the household's gathered changes of one type and sends an event
 * for each person, in one transaction, so the changes are marked merged
 * only if their events are saved. Each event is stamped with its last
 * change, so a receiver ordering by `timestamp` sees it where it happened,
 * not 30 seconds on, after events sent at once since. When no webhook
 * wants them any more, or webhooks are off, they're marked merged and
 * nothing is sent.
 */
async function mergeAndSend<T extends GatheredEventType>(
  tx: EntityManager,
  householdId: string,
  type: T
) {
  const rows = await tx.find(
    WebhookEvent,
    { type, gathered: true, merged: false },
    { orderBy: { createdAt: "asc", id: "asc" } }
  )
  const groups = byWho(rows)

  let sent = 0
  for (const group of groups) {
    const event = await sendEvent(tx, householdId, {
      type,
      data: await mergeParts(tx, type, group.parts as GatheredPart<T>[]),
      actor: group.actor,
      createdAt: group.lastAt,
    })
    if (event) sent++
  }

  for (const row of rows) {
    row.merged = true
  }
  await tx.flush()
  return { merged: rows.length, sent }
}

/**
 * Merges and sends a household's gathered changes of one type, 30 seconds
 * after the first. One at a time across the server, so two merges never
 * take the same changes; a change made while one runs starts it over
 * (queueGathering), and the runner runs it again when it's done.
 */
export const gatherJob: JobHandler = {
  kind: WEBHOOK_GATHER_JOB,
  concurrency: 1,
  async run({ em, payload, householdId }) {
    const type = gatheredType(payload)
    if (!householdId) {
      throw new Error("Gathered events are merged for one household.")
    }
    return inHouseholdTransaction(em, householdId, (tx) =>
      mergeAndSend(tx, householdId, type)
    )
  },
}
