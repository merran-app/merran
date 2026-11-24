import type { QueryClient } from "@tanstack/react-query"

import { recipeQuery, type Recipe } from "./queries"

/**
 * What Merran does for a recipe in the background, as the recipe lists it.
 * Past the 10-second wait a request answers with the job, and the recipe
 * isn't fetched again until the job's changes arrive; this puts the work
 * into the recipe at once, so its button and spinner show it going.
 */
export function markWorking(
  queryClient: QueryClient,
  slug: string,
  work: Recipe["working"][number]
) {
  queryClient.setQueryData(recipeQuery(slug).queryKey, (recipe) => {
    if (!recipe || recipe.working.includes(work)) return recipe
    return { ...recipe, working: [...recipe.working, work] }
  })
}
