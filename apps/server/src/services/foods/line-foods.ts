import { lineFoods, type LineFood } from "@merran/shared"

// What a recipe line names, worked out once. A line's foods depend only on
// its text and the built-in vocabulary (never on a household), so the text
// is the whole key, and a recipe nobody has edited costs nothing to read
// again.

/** Lines kept; the oldest is dropped first beyond this. */
export const LINE_FOODS_KEPT = 20_000

const kept = new Map<string, readonly LineFood[]>()

/**
 * The foods a line names, as `lineFoods` says. The same objects go to every
 * caller, so they're frozen: a caller that changes one fails loudly instead
 * of changing it for everyone.
 */
export function lineFoodsOf(line: string): readonly LineFood[] {
  const found = kept.get(line)
  if (found) return found

  const foods = Object.freeze(
    lineFoods(line).map((food) => Object.freeze(food))
  )
  kept.set(line, foods)
  if (kept.size > LINE_FOODS_KEPT) {
    // A Map iterates in the order its keys were added: the first is oldest.
    const oldest = kept.keys().next().value
    if (oldest !== undefined) kept.delete(oldest)
  }
  return foods
}
