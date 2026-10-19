import { dietsFor } from "@merran/shared"
import { queryOptions } from "@tanstack/react-query"
import { api, unwrap } from "@/lib/api/client"
import type { Recipe } from "@/features/recipes/queries"
import type { PlanEntry } from "./queries"

export const planEntryQuery = (id: string) =>
  queryOptions({
    queryKey: ["plan", "entry", id],
    queryFn: () =>
      unwrap(
        api.GET("/api/plan/entries/{entryId}", {
          params: { path: { entryId: id } },
        })
      ),
  })

/** Saved meal ingredients win over later library edits; old nutrition doesn't. */
export function mealRecipe(recipe: Recipe, entry?: PlanEntry): Recipe {
  const variant = entry?.variants.find((value) => value.recipeId === recipe.id)
  return variant
    ? {
        ...recipe,
        name: variant.name,
        servings: variant.servings,
        ingredients: variant.ingredients,
        steps: variant.steps,
        needs: variant.needs,
        nutrition: null,
        diets: dietsFor(variant.ingredients.map((line) => line.text)),
        dietOverrides: {},
      }
    : recipe
}
