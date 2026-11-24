import { queryOptions, useQueryClient } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

import { stillOpening } from "./opening"

export type ShelfRecipe = Schemas["ShelfRecipe"]
export type FollowedSite = Schemas["FollowedSite"]
export type CollectionSummary = Schemas["CollectionSummary"]
export type Collection = Schemas["Collection"]

// Under ["recipes"], so live updates and imports refresh them too.

export const sitesQuery = queryOptions({
  queryKey: ["recipes", "sites"],
  queryFn: () => unwrap(api.GET("/api/sites")),
  // While Merran's opening a site's posts, look again soon.
  refetchInterval: (query) =>
    query.state.data?.sites.some((site) => stillOpening(site)) ? 5000 : false,
})

/** Whether any sites are followed, and a few to suggest, without their recipes. */
export const siteSuggestionsQuery = queryOptions({
  queryKey: ["recipes", "sites", "suggestions"],
  queryFn: () => unwrap(api.GET("/api/sites/suggestions")),
})

export const siteRecipesQuery = queryOptions({
  queryKey: ["recipes", "sites", "recipes"],
  queryFn: () => unwrap(api.GET("/api/sites/recipes")),
  staleTime: 5 * 60_000,
})

export const collectionsQuery = queryOptions({
  queryKey: ["recipes", "collections"],
  queryFn: () => unwrap(api.GET("/api/collections")),
})

export const collectionQuery = (id: string) =>
  queryOptions({
    queryKey: ["recipes", "collections", id],
    queryFn: () =>
      unwrap(
        api.GET("/api/collections/{collection}", {
          params: { path: { collection: id } },
        })
      ),
  })

/**
 * A search for recipes online, looked at again every 2 seconds while it's
 * searching: what a collection's Find more waits on, rather than the whole
 * collection.
 */
export const discoveryQuery = (id: string) =>
  queryOptions({
    queryKey: ["recipes", "discover", id],
    queryFn: () =>
      unwrap(
        api.GET("/api/discover/{discoveryId}", {
          params: { path: { discoveryId: id } },
        })
      ),
    refetchInterval: (query) =>
      query.state.data?.status === "searching" ? 2000 : false,
  })

/** Refreshes everything from the recipe sites. */
export function useRefreshSites() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["recipes", "sites"] }),
      queryClient.invalidateQueries({ queryKey: ["recipes", "collections"] }),
    ])
}
