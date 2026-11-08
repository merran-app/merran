import { combineLines, covers } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  PantryItem,
  ShoppingItem,
  type PlanEntry,
} from "../../database/entities/index.ts"
import { AppError } from "../../core/errors.ts"
import { inHouseholdTransaction } from "../../database/transactions.ts"
import { householdAliases } from "../foods/aliases.ts"
import { describeItems, typedItem } from "../list/list.ts"
import { onHandOf } from "../list/meals.ts"
import { findEntry } from "../plan/plan.ts"
import { hasRecipe, loadMealLines } from "../plan/meal-lines.ts"
import { itemSnapshot } from "./pantry.ts"

// "Ran out of anything?", asked once cooking's done: what ran out is
// used up at home and goes on the list. Running out mid-cook rarely means
// the frozen stock is gone, so the freezer's stays, unless cooking took
// that food from the freezer. What the meal took when it was cooked is
// left as it was, so marking it not cooked later puts back only that:
// what ran out really ran out.

/** Water comes from the tap: it never runs out. */
const WATER = "water"

export type RanOutFood = { food: string; name: string; staple: boolean }

/** A meal's foods, once each: its recipe's in order, then its side's. */
async function mealFoods(
  em: EntityManager,
  householdId: string,
  entry: PlanEntry
): Promise<RanOutFood[]> {
  if (!hasRecipe(entry)) return []
  const linesOf = await loadMealLines(em, householdId, [entry])
  const aliases = await householdAliases(em)
  const isStaple = await onHandOf(em, householdId)
  const lines = linesOf(entry)
  const foods = new Map<string, RanOutFood>()
  for (const need of combineLines(lines, aliases)) {
    if (need.food === WATER || foods.has(need.food)) continue
    foods.set(need.food, {
      food: need.food,
      name: need.name,
      staple: isStaple(need.name),
    })
  }
  // Adding up puts lines with no amount last: back in the recipe's order.
  const order = firstLines(lines, aliases)
  return [...foods.values()].sort(
    (a, b) => (order.get(a.food) ?? Infinity) - (order.get(b.food) ?? Infinity)
  )
}

/** Where in the meal's lines each food first comes. */
function firstLines(
  lines: Parameters<typeof combineLines>[0],
  aliases: Parameters<typeof combineLines>[1]
) {
  const order = new Map<string, number>()
  lines.forEach((line, index) => {
    for (const { food } of combineLines([line], aliases)) {
      if (!order.has(food)) order.set(food, index)
    }
  })
  return order
}

/** What could have run out cooking a meal: the chips to tick. */
export async function ranOutFoods(
  em: EntityManager,
  householdId: string,
  mealId: string
) {
  const entry = await findEntry(em, mealId)
  return { foods: await mealFoods(em, householdId, entry) }
}

/** Whether cooking the meal took some of a food from the freezer. */
function tookFromFreezer(entry: PlanEntry, food: string) {
  return (entry.pantryUsed ?? []).some(
    (taken) =>
      taken.storedIn === "freezer" &&
      taken.foodKey !== null &&
      covers(taken.foodKey, food)
  )
}

/**
 * Foods that ran out cooking a meal: everything of them at home is used
 * up, the freezer's only if cooking took from it, and with `list` each
 * goes on the list as a plain line, unless it's on already. Says what was
 * at home and what was listed, for Undo through the pantry's and the
 * list's restore.
 */
export async function ranOut(
  em: EntityManager,
  householdId: string,
  input: { meal: string; foods: readonly string[]; list: boolean }
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const entry = await findEntry(tx, input.meal)
    // Running out is something cooking finds out: a meal still planned
    // took nothing, and may not be made at all.
    if (entry.status !== "cooked") {
      throw new AppError(
        "conflict",
        "meal_not_cooked",
        "That meal isn't cooked yet."
      )
    }
    const chosen = new Set(input.foods)
    const foods = (await mealFoods(tx, householdId, entry)).filter((food) =>
      chosen.has(food.food)
    )

    const pantry = await tx.find(PantryItem, {})
    const usedUp: PantryItem[] = []
    for (const { food } of foods) {
      const freezerToo = tookFromFreezer(entry, food)
      for (const item of pantry) {
        if (!item.foodKey || !covers(item.foodKey, food)) continue
        if (item.storedIn === "freezer" && !freezerToo) continue
        if (!usedUp.includes(item)) usedUp.push(item)
      }
    }
    const before = usedUp.map(itemSnapshot)
    tx.remove(usedUp)

    const listed = input.list ? await listFoods(tx, householdId, foods) : []
    await tx.flush()
    return {
      usedUp: before,
      listed: await describeItems(tx, listed),
    }
  })
}

/**
 * Plain lines for no meal, each where its food goes. A food's left off
 * when it, or a kind of it, is on the list already, as the pantry counts
 * a kind of a food as that food.
 */
async function listFoods(
  tx: EntityManager,
  householdId: string,
  foods: readonly RanOutFood[]
) {
  const waiting = await tx.find(ShoppingItem, {
    checked: false,
    foodKey: { $ne: null },
  })
  const missing = foods.filter(
    ({ food }) => !waiting.some((item) => covers(item.foodKey!, food))
  )
  const listed: ShoppingItem[] = []
  for (const { name } of missing) {
    listed.push(await typedItem(tx, householdId, { name }))
  }
  return listed
}
