import type { RecipeDetails } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { Recipe } from "../../../database/entities/index.ts"
import type { RecipeInput } from "../../../http/schemas/recipes.ts"
import { chosenFoods, markedLines, snapshotOf } from "../recipes.ts"
import { tagsOf } from "../tags.ts"

/** A recipe's servings and times. */
export const detailsOf = (input: RecipeInput): RecipeDetails => ({
  servings: input.servings,
  prepMinutes: input.prepMinutes,
  cookMinutes: input.cookMinutes,
  totalMinutes: input.totalMinutes,
})

/**
 * A recipe as review sees it: its editor lines, their marks, and the
 * foods lines were said to be.
 */
export async function reviewSnapshot(em: EntityManager, recipe: Recipe) {
  const tags = (await tagsOf(em, [recipe.id])).get(recipe.id) ?? []
  return {
    input: snapshotOf(recipe, tags),
    marks: markedLines(recipe),
    foods: chosenFoods(recipe),
  }
}
