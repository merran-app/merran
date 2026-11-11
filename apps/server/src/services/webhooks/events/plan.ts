import type { EntityManager } from "@mikro-orm/sql"
import type { PlanEntry } from "../../../database/entities/index.ts"
import { snapshotOf, type EntrySnapshot } from "../../plan/snapshots.ts"
import type { GatheredPart } from "../gathering/gathering.ts"
import { record } from "../record.ts"

// What the plan tells webhooks: plan.changed, gathered from every add, move
// and removal, whatever did it. Each plan function takes snapshots of the
// meals it touches, changes them, and says what it did with the two.

type PlanChange = GatheredPart<"plan.changed">

/** Where a meal is: a day, or its week's pool. */
type Place = Pick<EntrySnapshot, "date" | "anyDay">

/** Whether a meal's place in the plan is another: day, pool, meal or order. */
function movedBetween(before: EntrySnapshot, after: EntrySnapshot): boolean {
  return (
    before.date !== after.date ||
    before.anyDay !== after.anyDay ||
    before.meal !== after.meal ||
    before.position !== after.position
  )
}

/** Whether what a meal is has changed: its dishes, note or servings. */
function changedBetween(before: EntrySnapshot, after: EntrySnapshot): boolean {
  return (
    before.recipe !== after.recipe ||
    before.withRecipe !== after.withRecipe ||
    before.note !== after.note ||
    before.servings !== after.servings ||
    JSON.stringify(before.variants ?? []) !==
      JSON.stringify(after.variants ?? [])
  )
}

/**
 * What changed between the meals as they were and as they are, matched by
 * id. Their status, when they were cooked or listed, and why they were
 * picked don't count: marking meals made or Didn't is meal.cooked and
 * meal.skipped.
 */
export function planChange(
  before: readonly EntrySnapshot[],
  after: readonly EntrySnapshot[]
): PlanChange {
  const was = new Map(before.map((entry) => [entry.id, entry]))
  const now = new Map(after.map((entry) => [entry.id, entry]))
  const days = new Set<string>()
  const pools = new Set<string>()
  let added = 0
  let moved = 0
  let changed = 0
  let removed = 0

  const touch = (place: Place) => {
    if (place.anyDay) pools.add(place.date)
    else days.add(place.date)
  }

  for (const entry of after) {
    const old = was.get(entry.id)
    if (!old) {
      added += 1
      touch(entry)
    } else if (movedBetween(old, entry)) {
      moved += 1
      touch(old)
      touch(entry)
    } else if (changedBetween(old, entry)) {
      changed += 1
      touch(entry)
    }
  }
  for (const entry of before) {
    if (now.has(entry.id)) continue
    removed += 1
    touch(entry)
  }

  return {
    ...(days.size > 0 ? { days: [...days].sort() } : {}),
    ...(pools.size > 0 ? { pools: [...pools].sort() } : {}),
    ...(added > 0 ? { added } : {}),
    ...(moved > 0 ? { moved } : {}),
    ...(changed > 0 ? { changed } : {}),
    ...(removed > 0 ? { removed } : {}),
  }
}

/**
 * Tells webhooks what a plan change did: the meals it touched as they were,
 * and as they are now (none, for ones it removed). Called after the change
 * is made, with the entity manager or transaction it was made in.
 */
export async function recordPlanEvents(
  em: EntityManager,
  householdId: string,
  change: {
    before: readonly EntrySnapshot[]
    after: readonly PlanEntry[]
    /** Undo restores meals, so it never says they were cooked or skipped again. */
    undo?: boolean
  }
): Promise<void> {
  await record(em, householdId, {
    type: "plan.changed",
    data: planChange(change.before, change.after.map(snapshotOf)),
  })
}
