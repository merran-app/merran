import { QueryClient } from "@tanstack/react-query"

import { freshFor, refetchOnFocus } from "@/features/live/state"

import { ApiError } from "./api/client"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // While the live stream works, it says when the data it covers
      // changes, so that isn't asked for again when it's a little old, or
      // when someone comes back to the app. Queries with their own
      // staleTime keep it.
      staleTime: (query) => freshFor(query.queryKey),
      refetchOnWindowFocus: (query) => refetchOnFocus(query.queryKey),
      // A refused or missing request won't change by asking again.
      retry: (failures, error) =>
        !(error instanceof ApiError && error.status < 500) && failures < 2,
    },
  },
})
