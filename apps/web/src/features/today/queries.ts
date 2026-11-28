import { queryOptions } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type TodaySummary = Schemas["Today"]

/**
 * What Today shows of the list, the pantry and the recipes, in one request.
 * It's always asked again when Today opens: it depends on the day (what's
 * to use soon, what's not been made in three weeks), and the live stream
 * only says when something changed, not that the day did. Until the answer
 * comes, Today shows what it has.
 */
export const todayQuery = queryOptions({
  queryKey: ["today"],
  queryFn: () => unwrap(api.GET("/api/today")),
  staleTime: 0,
})

/**
 * Past meals nobody marked. Under "plan", so a meal answered on another
 * phone leaves this one too.
 */
export const unmarkedQuery = queryOptions({
  queryKey: ["plan", "unmarked"],
  queryFn: () => unwrap(api.GET("/api/plan/unmarked")),
})
