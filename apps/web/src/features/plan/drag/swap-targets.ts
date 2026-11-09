import type { Meal, PlanEntry } from "../queries"

/**
 * The dishes a dish could swap with in a dated meal. None in its own meal:
 * moving there changes nothing, and a new order is what reordering is for.
 */
export function swapTargets(
  entries: PlanEntry[],
  entry: PlanEntry,
  to: { date: string; meal: Meal }
) {
  const ownMeal =
    !entry.anyDay && entry.date === to.date && entry.meal === to.meal
  if (ownMeal) return []
  return entries.filter(
    (other) =>
      other.id !== entry.id &&
      !other.anyDay &&
      other.date === to.date &&
      other.meal === to.meal
  )
}
