import type { WebhookEventType } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { Job } from "../../../database/entities/index.ts"
import { ACTIVE, createJob } from "../../jobs/jobs.ts"

// Busy events are gathered (docs/webhooks.md, "Gathering"): each change
// records a small part, and a job 30 seconds after the first merges the
// parts into one event for each person, so checking off 30 things at the
// store sends one event rather than 30.

/** The events whose changes are gathered. */
export const GATHERED_EVENTS = [
  "plan.changed",
  "list.changed",
  "pantry.changed",
] as const satisfies readonly WebhookEventType[]
export type GatheredEventType = (typeof GATHERED_EVENTS)[number]

export function isGathered(type: WebhookEventType): type is GatheredEventType {
  return (GATHERED_EVENTS as readonly string[]).includes(type)
}

/** How long changes are gathered before they're sent. */
export const GATHER_MS = 30_000

/** The job that merges a household's gathered changes of one type. */
export const WEBHOOK_GATHER_JOB = "webhooks.gather"

// A change gives only the counts it has: one it leaves out is none.
type GatheredParts = {
  "plan.changed": {
    /** The days touched, as YYYY-MM-DD. */
    days?: string[]
    /** The weeks whose pool was touched, by their first day. */
    pools?: string[]
    added?: number
    moved?: number
    changed?: number
    removed?: number
  }
  "list.changed": {
    /** The ids of the lists touched. */
    lists: string[]
    added?: number
    checked?: number
    unchecked?: number
    changed?: number
    removed?: number
  }
  "pantry.changed": {
    added?: number
    usedUp?: number
    moved?: number
    changed?: number
    removed?: number
  }
}

/** What one change records of a gathered event, to be merged with the rest. */
export type GatheredPart<T extends GatheredEventType> = GatheredParts[T]

/** A part that counts nothing, which isn't worth recording. */
export function isEmptyPart(part: GatheredPart<GatheredEventType>): boolean {
  return Object.values(part).every(
    (value) => typeof value !== "number" || value === 0
  )
}

const gatherJobKey = (householdId: string, type: GatheredEventType) =>
  `${WEBHOOK_GATHER_JOB}:${householdId}:${type}`

/**
 * Makes sure a job will merge the household's gathered changes of `type`.
 * Called once the change is written: within its transaction, or saved. One
 * waiting will take this change too. One running may have read the changes
 * already, so it's started over 30 seconds on, and the runner queues it
 * again when its try ends. With neither, a new one is saved with the
 * caller's next flush.
 */
export async function queueGathering(
  em: EntityManager,
  householdId: string,
  type: GatheredEventType
): Promise<void> {
  const key = gatherJobKey(householdId, type)
  const runAt = new Date(Date.now() + GATHER_MS)
  const job = await em.findOne(Job, { key, status: { $in: [...ACTIVE] } })

  if (job) {
    // The runner may take the job between that read and this change being
    // saved, and merge without it. So the job is kept waiting by a write
    // that only finds it while it's waiting. Within a transaction,
    // Postgres then holds the runner's take until this change is saved,
    // and SQLite lets one writer at a time; outside one, the change is
    // saved already. If the runner took it meanwhile, it's running.
    const kept = await em.nativeUpdate(
      Job,
      { id: job.id, status: "queued" },
      { updatedAt: new Date() }
    )
    if (kept > 0) return

    // Only while it's still running: if it's finished meanwhile, this
    // change needs a job of its own.
    const rearmed = await em.nativeUpdate(
      Job,
      { id: job.id, status: "running" },
      { attempts: 0, runAt }
    )
    if (rearmed > 0) return
  }

  createJob(em, {
    kind: WEBHOOK_GATHER_JOB,
    key,
    householdId,
    payload: { type },
    runAt,
  })
}
