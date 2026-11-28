import { QueryClient } from "@tanstack/react-query"

import { freshFor, refetchOnFocus } from "@/features/live/state"
import { followOwnChanges } from "@/features/today/own-changes"

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

// The live stream doesn't come back to the device that made a change, so
// this device says itself when Today's summary is out of date.
followOwnChanges(queryClient)
