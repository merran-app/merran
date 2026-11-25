import { addDays, weekStartOf, type Meal } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import { PlanEntry } from "../../database/entities/index.ts"
import { toNumber } from "../../database/numbers.ts"
import { inHouseholdTransaction } from "../../database/transactions.ts"
import { householdClock } from "../households/clock.ts"
import {
  createEntry,
  describeEntry,
  findEntry,
  recipeFor,
  removeEntry,
} from "../plan/plan.ts"
import { snapshotOf } from "../plan/snapshots.ts"
import { recordPlanEvents } from "../webhooks/events/plan.ts"
import { followPlan, listMeals, shoppingFor } from "./meals.ts"

// A recipe onto the list without planning a day for it: a pie for tomorrow,
// with the week planned already. It's kept on the plan, so the list follows
// it like any other meal: its share of each line, the pantry set aside for
// it, swaps, and taking it off all work as they do for meals on the plan.
// A meal of it planned already and not on the list yet goes on instead,
// so a later Add from plan doesn't buy for it twice.

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

/** What Undo needs: the meal, whether adding made it, and its servings before. */
export type RecipeOnListUndo = {
  entry: string
  made: boolean
  servings: number | null
}

/**
 * The first meal of the recipe from today to the end of the week, or in
 * that week's pool, that's still to make and not on the list yet.
 */
async function waitingMeal(
  em: EntityManager,
  recipeId: string,
  today: string,
  week: string
) {
  return em.findOne(
    PlanEntry,
    {
      recipe: recipeId,
      status: "planned",
      listedAt: null,
      $or: [
        { anyDay: false, date: { $gte: today, $lte: addDays(week, 6) } },
        { anyDay: true, date: week },
      ],
    },
    {
      populate: ["recipe", "withRecipe"],
      orderBy: { date: "asc", anyDay: "asc", position: "asc" },
    }
  )
}

/** The meal planned already, with the servings asked for, onto the list. */
async function listWaiting(
  em: EntityManager,
  householdId: string,
  entry: PlanEntry,
  servings: number | null | undefined
) {
  const before = snapshotOf(entry)
  const servingsBefore = toNumber(entry.servings)
  const changed = servings != null && servings !== servingsBefore
  if (changed) entry.servings = servings
  const listed = await listMeals(em, householdId, [entry])
  if (changed) {
    await recordPlanEvents(em, householdId, {
      before: [before],
      after: [entry],
    })
  }
  const undo: RecipeOnListUndo = {
    entry: entry.id,
    made: false,
    servings: servingsBefore,
  }
  return { listed, undo }
}

/** A new meal in the week's any-day meals, onto the list. */
async function listNew(
  em: EntityManager,
  householdId: string,
  input: RecipeToList & { recipe: string },
  clock: { meals: Meal[]; weekStartsOn: number },
  week: string
) {
  const meal =
    input.meal ?? (clock.meals.includes("dinner") ? "dinner" : clock.meals[0]!)
  const entry = await createEntry(
    em,
    householdId,
    {
      date: week,
      anyDay: true,
      meal,
      recipe: input.recipe,
      withRecipe: input.withRecipe ?? null,
      servings: input.servings ?? null,
    },
    clock.weekStartsOn
  )
  await em.flush()
  const listed = await listMeals(em, householdId, [entry])
  // Said once it's listed, so webhooks hear of the meal as it is now.
  await recordPlanEvents(em, householdId, { before: [], after: [entry] })
  const undo: RecipeOnListUndo = { entry: entry.id, made: true, servings: null }
  return { entry, listed, undo }
}

/**
 * Puts a recipe's ingredients on the list, as Add from plan would, all or
 * none: a meal of it planned already this week, with the servings asked
 * for, or else a new one in the week's any-day meals. The week is the one
 * with tomorrow in it, so on its last day it's for the days coming rather
 * than a pool that ends tonight. Every-week items don't come along: this
 * is a trip for one thing, not the week's shop.
 */
export async function addRecipeToList(
  em: EntityManager,
  householdId: string,
  input: RecipeToList
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const clock = await householdClock(tx, householdId)
    const week = weekStartOf(addDays(clock.today, 1), clock.weekStartsOn)
    const recipe = await recipeFor(tx, input.recipe, "recipe")
    const waiting = await waitingMeal(tx, recipe.id, clock.today, week)

    const { entry, listed, undo } = waiting
      ? {
          entry: waiting,
          ...(await listWaiting(tx, householdId, waiting, input.servings)),
        }
      : await listNew(
          tx,
          householdId,
          { ...input, recipe: recipe.id },
          clock,
          week
        )
    await tx.flush()

    const { added, merged, onHand, inPantry } = listed
    return {
      entry: describeEntry(entry),
      made: undo.made,
      undo,
      added,
      merged,
      onHand,
      inPantry,
    }
  })
}

/**
 * Undo of adding a recipe to the list: a meal it made comes off the plan,
 * which takes its share off the list. One that was planned already stays,
 * off the list again, with its servings as they were.
 */
export async function undoRecipeOnList(
  em: EntityManager,
  householdId: string,
  undo: RecipeOnListUndo
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const entry = await findEntry(tx, undo.entry)
    if (undo.made) {
      // Only a meal it could have made: one in a week's pool, still to make.
      if (!entry.anyDay || entry.status !== "planned") {
        throw new AppError(
          "invalid",
          "not_made_here",
          "That meal wasn't made by adding a recipe to the list."
        )
      }
      await removeEntry(tx, householdId, entry.id)
      return
    }
    const before = snapshotOf(entry)
    await followPlan(tx, householdId, [
      { entry, was: shoppingFor(entry), now: null },
    ])
    entry.servings = undo.servings
    await recordPlanEvents(tx, householdId, {
      before: [before],
      after: [entry],
    })
    await tx.flush()
  })
}
