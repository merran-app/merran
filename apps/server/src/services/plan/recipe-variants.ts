import type { MealRecipe } from "@merran/shared"
import type { PlanEntry, Recipe } from "../../database/entities/index.ts"
import { describeRecipe } from "../recipes/recipes.ts"

/** Snapshot the recipe once: later library edits cannot change a shopping swap. */
export function recipeForMeal(entry: PlanEntry, recipe: Recipe): MealRecipe {
  const saved = entry.variants?.find(
    (variant) => variant.recipeId === recipe.id
  )
  if (saved) return structuredClone(saved)
  const source = describeRecipe(recipe, [])
  return {
    recipeId: recipe.id,
    name: recipe.name,
    servings: source.servings,
    basedOn: source.updatedAt,
    needs: source.needs,
    ingredients: source.ingredients.map((line) => ({
      ...line,
      foodKey:
        recipe.ingredients
          .getItems()
          .find((original) => original.id === line.id)?.foodKey ?? null,
    })),
    steps: source.steps,
  }
}
