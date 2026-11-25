import type { Meal } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { inHouseholdTransaction } from "../../database/transactions.ts"
import { householdClock } from "../households/clock.ts"
import { createEntry, describeEntry } from "../plan/plan.ts"
import { recordPlanEvents } from "../webhooks/events/plan.ts"
import { listMeals } from "./meals.ts"

// A recipe onto the list without planning a day for it: a pie for tomorrow,
// with the week planned already. It's kept in this week's any-day meals, so
// the list follows it like any other meal: its share of each line, the
// pantry set aside for it, swaps, and taking it off all work as they do for
// meals on the plan.

export type RecipeToList = {
  /** The recipe, by id or address. */
  recipe: string
  /** A side or sauce it's made with, by id or address. */
  withRecipe?: string | null
  /** None means the recipe's own. */
  servings?: number | null
  /** The pool's meal it goes in; dinner, or the household's first, if not. */
  meal?: Meal
}

/**
 * Puts a recipe in this week's any-day meals and its ingredients on the
 * list, as Add from plan would, all or none. Every-week items don't come
 * along: this is a trip for one thing, not the week's shop.
 */
export async function addRecipeToList(
  em: EntityManager,
  householdId: string,
  input: RecipeToList
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const clock = await householdClock(tx, householdId)
    const meal =
      input.meal ??
      (clock.meals.includes("dinner") ? "dinner" : clock.meals[0]!)
    const entry = await createEntry(
      tx,
      householdId,
      {
        date: clock.today,
        anyDay: true,
        meal,
        recipe: input.recipe,
        withRecipe: input.withRecipe ?? null,
        servings: input.servings ?? null,
      },
      clock.weekStartsOn
    )
    await tx.flush()

    const { added, merged, onHand, inPantry } = await listMeals(
      tx,
      householdId,
      [entry]
    )
    // Said once it's listed, so webhooks hear of the meal as it is now.
    await recordPlanEvents(tx, householdId, { before: [], after: [entry] })
    await tx.flush()

    return { entry: describeEntry(entry), added, merged, onHand, inPantry }
  })
}
