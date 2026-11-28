import type {
  EnsureInfiniteQueryDataOptions,
  EnsureQueryDataOptions,
  QueryClient,
  QueryKey,
} from "@tanstack/react-query"

/**
 * Starts a page's query when its route opens, for the page to find in the
 * cache. It settles whether the query worked or not: a failed one shows its
 * error on the page, and a loader that threw would show the router's error
 * page instead.
 */
export async function preloadQuery<
  TQueryFnData,
  TError,
  TData,
  TQueryKey extends QueryKey,
>(
  queryClient: QueryClient,
  options: EnsureQueryDataOptions<TQueryFnData, TError, TData, TQueryKey>
) {
  try {
    await queryClient.ensureQueryData(options)
  } catch {
    // The page's own query shows the error.
  }
}

/** The same for a query that loads in pages: its first page. */
export async function preloadInfiniteQuery<
  TQueryFnData,
  TError,
  TData,
  TQueryKey extends QueryKey,
  TPageParam,
>(
  queryClient: QueryClient,
  options: EnsureInfiniteQueryDataOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TPageParam
  >
) {
  try {
    await queryClient.ensureInfiniteQueryData(options)
  } catch {
    // The page's own query shows the error.
  }
}
