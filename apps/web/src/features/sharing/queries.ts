import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type RecipeShare = Schemas["RecipeShare"]
export type HouseholdShare = Schemas["HouseholdShare"]

/** A recipe's link, or none while it isn't shared. */
export function recipeShareQuery(slug: string) {
  return queryOptions({
    queryKey: ["recipes", slug, "share"],
    queryFn: () =>
      unwrap(
        api.GET("/api/recipes/{recipe}/share", {
          params: { path: { recipe: slug } },
        })
      ),
  })
}

/** Every recipe the household shares, for its admins. */
export const householdSharesQuery = queryOptions({
  queryKey: ["household", "shares"],
  queryFn: () => unwrap(api.GET("/api/households/current/shares")),
})

/** Makes the recipe's link, or gives the one it already has. */
export function useShareRecipe(slug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/recipes/{recipe}/share", {
          params: { path: { recipe: slug } },
        })
      ),
    onSuccess: (share) => {
      queryClient.setQueryData(recipeShareQuery(slug).queryKey, { share })
      void queryClient.invalidateQueries({
        queryKey: householdSharesQuery.queryKey,
      })
    },
  })
}

/** Ends the recipe's link. Anyone holding it gets nothing from then on. */
export function useStopSharing(slug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      unwrap(
        api.DELETE("/api/recipes/{recipe}/share", {
          params: { path: { recipe: slug } },
        })
      ),
    onSuccess: () => {
      queryClient.setQueryData(recipeShareQuery(slug).queryKey, {
        share: null,
      })
      void queryClient.invalidateQueries({
        queryKey: householdSharesQuery.queryKey,
      })
    },
  })
}
