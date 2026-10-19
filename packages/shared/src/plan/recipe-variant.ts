import { parseIngredient } from "../ingredients/parse.ts"
import type { IngredientMark } from "../recipes/marks.ts"
import { swapNames } from "../steps/swap-names.ts"

/** A planned meal keeps its own ingredients and steps after a shopping swap. */
export type MealRecipe = {
  recipeId: string
  name: string
  servings: number | null
  basedOn: string
  needs: string[]
  ingredients: {
    id: string
    section: string | null
    text: string
    quantity: number | null
    quantityMax: number | null
    unit: string | null
    food: string | null
    note: string | null
    mark: IngredientMark | null
    foodKey?: string | null
  }[]
  steps: { id: string; section: string | null; text: string }[]
}

export function swapMealIngredient(
  recipe: MealRecipe,
  ingredientId: string,
  lines: string[],
  steps: { stepId: string; text: string }[]
): MealRecipe {
  const original = recipe.ingredients.find((line) => line.id === ingredientId)
  if (!original) throw new Error("That ingredient is no longer in this meal.")
  const names = lines
    .map((text) => parseIngredient(text).food)
    .filter(Boolean)
    .join(" and ")
  const changes = new Map(steps.map((step) => [step.stepId, step.text]))
  return {
    ...recipe,
    ingredients: recipe.ingredients.flatMap((line) =>
      line.id !== ingredientId
        ? [line]
        : lines.map((text, index) => {
            const parsed = parseIngredient(text)
            return {
              ...line,
              id: `${ingredientId}:swap:${index}`,
              text,
              quantity: parsed.quantity,
              quantityMax: parsed.quantityMax,
              unit: parsed.unitId,
              food: parsed.food,
              note: parsed.note,
              foodKey: null,
            }
          })
    ),
    steps: recipe.steps.map((step) => ({
      ...step,
      text:
        changes.get(step.id) ??
        (original.food && names
          ? swapNames(step.text, {
              from: original.food,
              to: names,
              others: recipe.ingredients
                .filter((line) => line.id !== ingredientId)
                .flatMap((line) => (line.food ? [line.food] : [])),
            }).text
          : step.text),
    })),
  }
}
