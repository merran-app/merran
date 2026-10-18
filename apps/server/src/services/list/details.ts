import {
  combineLines,
  formatAmount,
  joinAmounts,
  scaleIngredient,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { PlanEntry } from "../../database/entities/index.ts"
import { NOT_DELETED_FILTER } from "../../database/scope.ts"
import { hasRecipe, loadMealLines } from "../plan/meal-lines.ts"
import { toNumber } from "../recipes/recipes.ts"
import { householdAliases } from "./food-aliases.ts"
import { findItem } from "./list.ts"

/** Current recipe wording, matched with the same food and unit rules as the list. */
export async function itemDetails(em: EntityManager, itemId: string) {
  const item = await findItem(em, itemId)
  const shares = item.forMeals ?? []
  const ids = [...new Set(shares.map((share) => share.meal))]
  const entries =
    ids.length && item.foodKey
      ? await em.find(
          PlanEntry,
          { id: { $in: ids } },
          {
            populate: ["recipe"],
            filters: { [NOT_DELETED_FILTER]: false },
            orderBy: { date: "asc", position: "asc", id: "asc" },
          }
        )
      : []
  const aliases = await householdAliases(em)
  const linesOf = await loadMealLines(em, item.household.id, entries)
  const amount = { quantity: toNumber(item.quantity), unit: item.unit ?? null }
  const meals = entries.filter(hasRecipe).flatMap((entry) => {
    // Manual edits can change the row's unit. Match its recorded meal shares,
    // so those edits don't hide the recipe lines needed to check the amount.
    const contributions = shares.filter((share) => share.meal === entry.id)
    const lines = linesOf(entry)
      .filter((line) =>
        combineLines([line], aliases).some(
          (part) =>
            part.food === item.foodKey &&
            contributions.some(
              (share) => joinAmounts(share, part, item.foodKey!) !== null
            )
        )
      )
      .map((line) => ({
        recipe: line.source,
        original: line.text,
        planned: scaleIngredient(line.text, line.factor),
        factor: line.factor,
      }))
    if (!lines.length) return []
    return [
      {
        id: entry.id,
        name: entry.recipe!.getEntity().name,
        date: entry.date,
        anyDay: entry.anyDay,
        listedAmounts: contributions.map((share) =>
          formatAmount(share.quantity, share.unit)
        ),
        lines,
      },
    ]
  })
  return {
    name: item.name,
    amount: item.amountText ?? formatAmount(amount.quantity, amount.unit),
    source: item.source,
    meals,
    unavailableMeals: ids.length - meals.length,
  }
}
