import type { QueryClient } from "@tanstack/react-query"

import type { Recipe } from "./queries"

type Work = Recipe["working"][number]

/**
 * The recipe with that work added to what's going on for it, or as it was
 * when it's another recipe or already listed.
 */
export function withWorking<T extends { id: string; working: Work[] }>(
  recipe: T | undefined,
  recipeId: string,
  work: Work
): T | undefined {
  if (!recipe || recipe.id !== recipeId) return recipe
  if (recipe.working.includes(work)) return recipe
  return { ...recipe, working: [...recipe.working, work] }
}

/**
 * What Merran does for a recipe in the background, as the recipe lists it.
 * Past the 10-second wait a request answers with the job, and the recipe
 * isn't fetched again until the job's changes arrive; this puts the work
 * into the recipe at once, so its button and spinner show it going.
 *
 * A recipe's page is cached under whatever it was opened by, its slug or
 * its id (where a notice's View goes), so every cached copy is updated.
 */
export function markWorking(
  queryClient: QueryClient,
  recipeId: string,
  work: Work
) {
  queryClient.setQueriesData<Recipe>(
    { queryKey: ["recipes", "detail"] },
    (recipe) => withWorking(recipe, recipeId, work)
  )
}
