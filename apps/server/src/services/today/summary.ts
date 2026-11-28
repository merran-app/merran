import { clockIn, cookAgain, useSoonOrder } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { Household } from "../../database/entities/index.ts"
import { getList } from "../list/list.ts"
import { getPantry, type PantryItemView } from "../pantry/pantry.ts"
import { listRecipes } from "../recipes/recipes.ts"

// What Today shows at a glance, worked out here so the page doesn't load
// the whole list, the pantry and a page of recipes for a few counts and names.

/** How many names the list's glance gives. */
const LIST_NAMES = 3
/** How many names a meal's glance gives for what's set aside for it. */
const MEAL_NAMES = 4
/** The newest recipes shown. */
const RECENT_RECIPES = 6
/** How many top-rated recipes cook again picks from. */
const COOK_AGAIN_FROM = 48
const COOK_AGAIN_RECIPES = 6

export type TodayArea = "list" | "pantry" | "recipes"

type Recipes = Awaited<ReturnType<typeof listRecipes>>["recipes"]

export type TodaySummary = {
  /** What's left to buy: how many, the first three, and the meals it's for. */
  list: { toBuy: number; names: string[]; meals: string[] } | null
  /** What to use soon, most urgent first, and what's set aside for each meal. */
  pantry: {
    useSoon: PantryItemView[]
    meals: { id: string; names: string[] }[]
  } | null
  /** How many recipes, the six newest, and up to six to cook again. */
  recipes: {
    total: number
    recent: Recipes
    cookAgain: Recipes
  } | null
}

async function listGlance(em: EntityManager, householdId: string) {
  const { items } = await getList(em, householdId)
  const left = items.filter((item) => !item.checked)
  const meals = new Set(
    left.flatMap((item) => item.meals.map((meal) => meal.id))
  )
  return {
    toBuy: left.length,
    names: left.slice(0, LIST_NAMES).map((item) => item.name),
    meals: [...meals],
  }
}

async function pantryGlance(em: EntityManager, householdId: string) {
  const { items } = await getPantry(em, householdId)
  // The sort is stable, so items as urgent as each other keep the pantry's order.
  const useSoon = items
    .filter((item) => item.useSoon)
    .sort((a, b) => useSoonOrder(a.useSoon!) - useSoonOrder(b.useSoon!))

  const namesByMeal = new Map<string, string[]>()
  for (const item of items) {
    for (const meal of item.meals) {
      const names = namesByMeal.get(meal.id) ?? []
      if (names.length < MEAL_NAMES) names.push(item.name)
      namesByMeal.set(meal.id, names)
    }
  }
  const meals = [...namesByMeal].map(([id, names]) => ({ id, names }))
  return { useSoon, meals }
}

async function recipesGlance(em: EntityManager, householdId: string) {
  const household = await em.findOneOrFail(Household, { id: householdId })
  const newest = await listRecipes(em, {
    tag: [],
    diet: [],
    sort: "newest",
    limit: RECENT_RECIPES,
    offset: 0,
  })
  const topRated = await listRecipes(em, {
    tag: [],
    diet: [],
    sort: "rating",
    limit: COOK_AGAIN_FROM,
    offset: 0,
  })
  return {
    total: newest.total,
    recent: newest.recipes,
    cookAgain: cookAgain(
      topRated.recipes,
      clockIn(household.timeZone).today,
      COOK_AGAIN_RECIPES
    ),
  }
}

/**
 * What Today shows at a glance. A part whose area isn't readable is null,
 * and isn't read at all.
 */
export async function todaySummary(
  em: EntityManager,
  householdId: string,
  readable: ReadonlySet<TodayArea>
): Promise<TodaySummary> {
  return {
    list: readable.has("list") ? await listGlance(em, householdId) : null,
    pantry: readable.has("pantry") ? await pantryGlance(em, householdId) : null,
    recipes: readable.has("recipes")
      ? await recipesGlance(em, householdId)
      : null,
  }
}
