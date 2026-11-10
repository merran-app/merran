import {
  duplicateReasons,
  findDuplicatePairs,
  foodWord,
  type DuplicateCandidate,
  type DuplicateReason,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import {
  Recipe,
  RecipeIngredient,
  RecipeNotDuplicate,
} from "../../database/entities/index.ts"
import { photoUrls } from "./photos/photos.ts"
import { findRecipe } from "./recipes.ts"

// Possible duplicates: the household's recipes that may be the same one,
// worked out on each request from their links, names and foods, less the
// pairs someone said aren't the same. Recently deleted recipes are left
// out by the em's filter.

/** A recipe that may be another one, and why. */
export type RecipeDuplicate = {
  id: string
  slug: string
  name: string
  photo: string | null
  sourceUrl: string | null
  createdAt: string
  reasons: DuplicateReason[]
}

/** Two recipes that may be the same one, the older first. */
export type DuplicatePair = {
  recipes: [RecipeDuplicate, RecipeDuplicate]
  reasons: DuplicateReason[]
}

type LibraryRecipe = DuplicateCandidate & {
  id: string
  slug: string
  image: string | null
  createdAt: Date
}

/** The household's recipes, oldest first, with what matching reads of them. */
async function library(em: EntityManager): Promise<LibraryRecipe[]> {
  const recipes = await em.find(
    Recipe,
    {},
    {
      fields: ["id", "slug", "name", "sourceUrl", "image", "createdAt"],
      orderBy: { createdAt: "asc", id: "asc" },
    }
  )
  const lines = recipes.length
    ? await em.find(
        RecipeIngredient,
        { recipe: { $in: recipes.map((recipe) => recipe.id) } },
        { fields: ["recipe", "food", "foodKey"] }
      )
    : []
  const foods = new Map<string, Set<string>>()
  for (const line of lines) {
    const food = line.foodKey ?? line.food
    if (!food) continue
    const id = line.recipe.id
    const set = foods.get(id) ?? new Set<string>()
    set.add(foodWord(food))
    foods.set(id, set)
  }
  return recipes.map((recipe) => ({
    id: recipe.id,
    slug: recipe.slug,
    name: recipe.name,
    sourceUrl: recipe.sourceUrl ?? null,
    image: recipe.image ?? null,
    createdAt: recipe.createdAt,
    foods: [...(foods.get(recipe.id) ?? [])],
  }))
}

/** Two recipes' ids in one order, as a pair is kept. */
const ordered = (a: string, b: string): [string, string] =>
  a < b ? [a, b] : [b, a]

const pairKey = (a: string, b: string) => ordered(a, b).join("|")

/** The pairs someone in the household said aren't the same. */
async function dismissed(em: EntityManager) {
  const rows = await em.find(
    RecipeNotDuplicate,
    {},
    { fields: ["first", "second"] }
  )
  return new Set(rows.map((row) => pairKey(row.first.id, row.second.id)))
}

/** A recipe as a possible duplicate shows. */
function describe(
  recipe: LibraryRecipe,
  reasons: DuplicateReason[]
): RecipeDuplicate {
  return {
    id: recipe.id,
    slug: recipe.slug,
    name: recipe.name,
    photo: photoUrls(recipe)?.card ?? null,
    sourceUrl: recipe.sourceUrl,
    createdAt: recipe.createdAt.toISOString(),
    reasons,
  }
}

/**
 * A recipe's possible duplicates among the household's others: the same
 * link first, then the oldest first.
 */
export async function duplicatesOf(
  em: EntityManager,
  recipe: string
): Promise<RecipeDuplicate[]> {
  const { id } = await findRecipe(em, recipe)
  const [recipes, notSame] = await Promise.all([library(em), dismissed(em)])
  const target = recipes.find((other) => other.id === id)
  if (!target) return []
  const found = recipes.flatMap((other) => {
    if (other.id === id || notSame.has(pairKey(id, other.id))) return []
    const reasons = duplicateReasons(target, other)
    return reasons.length ? [describe(other, reasons)] : []
  })
  // Already in order of age; the same link moves ahead.
  return [
    ...found.filter((other) => other.reasons.includes("link")),
    ...found.filter((other) => !other.reasons.includes("link")),
  ]
}

/**
 * Every pair of the household's recipes that may be the same one, each
 * once, the older recipe first, the pairs with the newest recipe first.
 */
export async function duplicatePairs(
  em: EntityManager
): Promise<DuplicatePair[]> {
  const [recipes, notSame] = await Promise.all([library(em), dismissed(em)])
  const byId = new Map(recipes.map((recipe, index) => [recipe.id, index]))
  return findDuplicatePairs(recipes)
    .filter((pair) => !notSame.has(pairKey(pair.a, pair.b)))
    .sort((one, two) => byId.get(two.b)! - byId.get(one.b)!)
    .map((pair) => ({
      recipes: [
        describe(recipes[byId.get(pair.a)!]!, pair.reasons),
        describe(recipes[byId.get(pair.b)!]!, pair.reasons),
      ],
      reasons: pair.reasons,
    }))
}

/**
 * Keeps two recipes as not the same, for everyone in the household, so
 * they aren't shown as possible duplicates again. Saying so twice is fine.
 */
export async function dismissDuplicate(
  em: EntityManager,
  recipe: string,
  other: string,
  userId: string | null
): Promise<void> {
  const one = await findRecipe(em, recipe)
  const two = await findRecipe(em, other)
  if (one.id === two.id) {
    throw new AppError("invalid", "same_recipe", "That's the same recipe.")
  }
  const [first, second] = ordered(one.id, two.id)
  if (await em.findOne(RecipeNotDuplicate, { first, second })) return
  em.create(RecipeNotDuplicate, {
    household: one.household,
    first,
    second,
    createdBy: userId,
  })
  await em.flush()
}
