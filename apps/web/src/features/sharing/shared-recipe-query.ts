import { queryOptions } from "@tanstack/react-query"

import { api, ApiError, unwrap } from "@/lib/api/client"

/**
 * The recipe behind a shared link, or null when the link doesn't work any
 * more. Any other refusal, like too many visits, stays an error.
 *
 * Fetched once per visit: a guest switching apps mid-cook keeps the recipe
 * on screen, even if the link is stopped meanwhile; cooking reuses what the
 * page fetched; and the link's rate limit sees fewer requests.
 */
export function sharedRecipeQuery(token: string) {
  return queryOptions({
    queryKey: ["shared", token],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      try {
        return await unwrap(
          api.GET("/api/shared/{token}", {
            params: { path: { token } },
          })
        )
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
  })
}

/** Whether the link was opened too often just now, and will work again soon. */
export function isTooManyVisits(error: unknown) {
  return error instanceof ApiError && error.status === 429
}
