import {
  infiniteQueryOptions,
  queryOptions,
  useQueryClient,
} from "@tanstack/react-query"

import { followEvery } from "@/features/live/state"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { nextOffset } from "@/lib/pages"

import { stillOpening } from "./opening"

export type ShelfRecipe = Schemas["ShelfRecipe"]
export type FollowedSite = Schemas["FollowedSite"]
export type SiteRecipesPage = Schemas["SiteRecipesPage"]
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

/** How many of a site's recipes each Show more brings. */
const SITE_PAGE = 24

/**
 * A followed site's recipes as pages: first the newest, which
 * `GET /api/sites` gives with the site, then what each Show more brought.
 */
export function sitePages(
  site: FollowedSite,
  more: readonly SiteRecipesPage[] = []
): SiteRecipesPage[] {
  return [{ recipes: site.recipes, total: site.total }, ...more]
}

/**
 * The pages a followed site's Show more brings, after the first that comes
 * with the site. It takes the site, not just its id, to start after the
 * recipes shown. Nothing's asked for until Show more is pressed, so the
 * Sites tab costs no request for each site; from then on, live changes
 * refresh these pages with the sites, as they're under their key.
 */
export const siteRecipesPagesQuery = (site: FollowedSite) =>
  infiniteQueryOptions({
    queryKey: ["recipes", "sites", "site", site.id],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/sites/{site}/recipes", {
          params: {
            path: { site: site.id },
            query: { offset: pageParam, limit: SITE_PAGE },
          },
        })
      ),
    initialPageParam: site.recipes.length,
    getNextPageParam: (_last, pages) =>
      nextOffset(sitePages(site, pages), (page) => page.recipes.length),
    // Show more's first press fetches the first of these pages by hand.
    enabled: (query) => query.state.data !== undefined,
  })

export const collectionsQuery = queryOptions({
  queryKey: ["recipes", "collections"],
  queryFn: () => unwrap(api.GET("/api/collections")),
})

/** How many of a collection's recipes each page brings. */
const COLLECTION_PAGE = 24

/**
 * A collection as pages of its recipes, 24 at a time. The header, its
 * counts and what Find more found come with the first page.
 */
export const collectionQuery = (id: string) =>
  infiniteQueryOptions({
    queryKey: ["recipes", "collections", id],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/collections/{collection}", {
          params: {
            path: { collection: id },
            query: { offset: pageParam, limit: COLLECTION_PAGE },
          },
        })
      ),
    initialPageParam: 0,
    getNextPageParam: (_last, pages) =>
      nextOffset(
        // A collection says how many it has as its count.
        pages.map((page) => ({ ...page, total: page.count })),
        (page) => page.recipes.length
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
      query.state.data?.status === "searching" ? followEvery(2000) : false,
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
