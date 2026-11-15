import type { MealRecipe } from "@merran/shared"
import type { PlanEntry } from "../../database/entities/index.ts"
import { toNumber } from "../../database/numbers.ts"

/** A meal as it was, to put it back as it was (Undo). */
export function snapshotOf(entry: PlanEntry) {
  return {
    id: entry.id,
    date: entry.date,
    anyDay: entry.anyDay,
    meal: entry.meal,
    position: entry.position,
    status: entry.status,
    recipe: entry.recipe?.id ?? null,
    withRecipe: entry.withRecipe?.id ?? null,
    note: entry.note ?? null,
    servings: toNumber(entry.servings),
    listedAt: entry.listedAt?.toISOString() ?? null,
    why: entry.why ?? null,
    cookedAt: entry.cookedAt?.toISOString() ?? null,
    variants: entry.variants ?? [],
  }
}

export type EntrySnapshot = Omit<ReturnType<typeof snapshotOf>, "variants"> & {
  variants?: MealRecipe[]
}
