import { queryOptions, useQueryClient } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type RecipeDuplicate = Schemas["RecipeDuplicate"]
export type DuplicatePair = Schemas["DuplicatePair"]

/** A recipe's possible duplicates, by its id or slug. */
export const recipeDuplicatesQuery = (recipe: string) =>
  queryOptions({
    queryKey: ["recipes", "duplicates", recipe],
    queryFn: async () =>
      (
        await unwrap(
          api.GET("/api/recipes/{recipe}/duplicates", {
            params: { path: { recipe } },
          })
        )
      ).duplicates,
  })

/** Every pair of the household's recipes that may be the same one. */
export const duplicatePairsQuery = queryOptions({
  queryKey: ["recipes", "duplicates"],
  queryFn: async () => (await unwrap(api.GET("/api/recipes/duplicates"))).pairs,
})

/**
 * Says two recipes aren't the same, for everyone in the household, and
 * refreshes every list of possible duplicates.
 */
export function useDismissDuplicate() {
  const queryClient = useQueryClient()
  return async (recipe: string, other: string) => {
    await unwrap(
      api.POST("/api/recipes/{recipe}/duplicates/{other}/dismiss", {
        params: { path: { recipe, other } },
      })
    )
    await queryClient.invalidateQueries({
      queryKey: ["recipes", "duplicates"],
    })
  }
}
