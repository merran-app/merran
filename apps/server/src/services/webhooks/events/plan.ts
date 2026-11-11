import type { EntityManager } from "@mikro-orm/sql"
import type { PlanEntry } from "../../../database/entities/index.ts"
import { toNumber } from "../../../database/numbers.ts"
import { snapshotOf, type EntrySnapshot } from "../../plan/snapshots.ts"
import type { GatheredPart } from "../gathering/gathering.ts"
import { recipeRef, type MealRef } from "../payloads.ts"
import { record } from "../record.ts"

// What the plan tells webhooks: plan.changed, gathered from every add, move
// and removal, whatever did it, and meal.cooked and meal.skipped, sent at
// once. Each plan function takes snapshots of the meals it touches, changes
// them, and says what it did with the two.

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
 * A meal as events carry it. Its recipe and side are loaded when they
 * aren't. Its title is the recipe's name, or the version's when the meal has
 * one, as the plan shows it; for a meal that's only a note, the note.
 */
export async function mealRef(
  em: EntityManager,
  entry: PlanEntry
): Promise<MealRef> {
  await em.populate(entry, ["recipe", "withRecipe"])
  const main = entry.recipe?.getEntity()
  const side = entry.withRecipe?.getEntity()
  const variant = entry.variants?.find((value) => value.recipeId === main?.id)
  return {
    entryId: entry.id,
    date: entry.date,
    meal: entry.meal,
    pool: entry.anyDay,
    title: variant?.name ?? main?.name ?? entry.note ?? "",
    recipe: main ? recipeRef(main) : null,
    side: side ? recipeRef(side) : null,
  }
}

/** How many servings a meal made: its own, else its version's or recipe's. */
function servingsMade(entry: PlanEntry): number | null {
  const own = toNumber(entry.servings)
  if (own !== null) return own

  const main = entry.recipe?.getEntity()
  const variant = entry.variants?.find((value) => value.recipeId === main?.id)
  return variant?.servings ?? toNumber(main?.servings) ?? null
}

/**
 * Tells webhooks that meals were marked made or Didn't: those that are now,
 * and weren't before. A meal that wasn't in `before` was added by being
 * made.
 */
async function recordMealEvents(
  em: EntityManager,
  householdId: string,
  before: readonly EntrySnapshot[],
  after: readonly PlanEntry[]
): Promise<void> {
  const was = new Map(before.map((entry) => [entry.id, entry]))

  for (const entry of after) {
    const old = was.get(entry.id)
    if (entry.status === "cooked" && old?.status !== "cooked") {
      // The meal first, which loads the recipe its servings may come from.
      const meal = await mealRef(em, entry)
      await record(em, householdId, {
        type: "meal.cooked",
        data: { ...meal, servings: servingsMade(entry), planned: !!old },
      })
    } else if (entry.status === "skipped" && old?.status !== "skipped") {
      await record(em, householdId, {
        type: "meal.skipped",
        data: await mealRef(em, entry),
      })
    }
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
  if (!change.undo) {
    await recordMealEvents(em, householdId, change.before, change.after)
  }
  await record(em, householdId, {
    type: "plan.changed",
    data: planChange(change.before, change.after.map(snapshotOf)),
  })
}
