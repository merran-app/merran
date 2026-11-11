import type { describeRecipe } from "../recipes/recipes.ts"
import type { RecipePart } from "./payloads.ts"

export type RecipeDetail = ReturnType<typeof describeRecipe>

/**
 * What each part of a recipe is, for telling which an edit changed. Lines
 * and steps are made new on every save, so their ids are left out. `photo`
 * and `diets` aren't here: the code that sets them says so itself.
 */
const PARTS = {
  details: (recipe: RecipeDetail) => [
    recipe.name,
    recipe.description,
    recipe.servings,
    recipe.yieldText,
    recipe.prepMinutes,
    recipe.cookMinutes,
    recipe.totalMinutes,
    recipe.sourceUrl,
    recipe.notes,
  ],
  ingredients: (recipe: RecipeDetail) =>
    recipe.ingredients.map((line) => [
      line.section,
      line.text,
      line.quantity,
      line.quantityMax,
      line.unit,
      line.food,
      line.note,
      line.mark,
    ]),
  steps: (recipe: RecipeDetail) =>
    recipe.steps.map((step) => [step.section, step.text]),
  tags: (recipe: RecipeDetail) => [...recipe.tags].sort(),
} satisfies Partial<Record<RecipePart, (recipe: RecipeDetail) => unknown>>

/** The parts of a recipe that an edit changed, in the order events list them. */
export function changedParts(
  before: RecipeDetail,
  after: RecipeDetail
): RecipePart[] {
  const parts = Object.keys(PARTS) as (keyof typeof PARTS)[]
  return parts.filter(
    (part) =>
      JSON.stringify(PARTS[part](before)) !== JSON.stringify(PARTS[part](after))
  )
}
