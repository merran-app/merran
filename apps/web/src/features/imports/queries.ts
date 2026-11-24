import { queryOptions } from "@tanstack/react-query"

import { followEvery } from "@/features/live/state"
import { api, unwrap, type Schemas } from "@/lib/api/client"

export type Import = Schemas["Import"]
export type ImportDetail = Schemas["ImportDetail"]

/** Where each list on an import's page starts, a hundred at a time. */
export type ImportPages = {
  cameIn?: number
  alreadyHere?: number
  didntComeIn?: number
}

/** Still going: waiting to start, or importing. */
export const isGoing = (found: Pick<Import, "status">) =>
  found.status === "queued" || found.status === "running"

/** The household's imports, asked about while one is going. */
export const importsQuery = queryOptions({
  queryKey: ["imports"],
  queryFn: () => unwrap(api.GET("/api/imports")),
  // The live stream says when one moves; asking is for when it can't.
  refetchInterval: (query) =>
    query.state.data?.imports.some(isGoing) ? followEvery(2000) : false,
})

/** One import's page, asked about while it's going. */
export const importQuery = (importId: string, pages: ImportPages = {}) =>
  queryOptions({
    queryKey: ["imports", importId, pages],
    queryFn: () =>
      unwrap(
        api.GET("/api/imports/{importId}", {
          params: { path: { importId }, query: pages },
        })
      ),
    refetchInterval: (query) =>
      query.state.data && !isGoing(query.state.data)
        ? false
        : followEvery(1000),
  })
