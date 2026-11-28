import { queryOptions } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type TodaySummary = Schemas["Today"]

/**
 * What Today shows of the list, the pantry and the recipes, in one request.
 * It's fresh as long as the live stream says nothing changed, as with the
 * areas it counts (see LIVE_REFRESH). Changes made on this device, which the
 * stream doesn't send back, make it stale through followOwnChanges. Until the
 * answer comes, Today shows what it has.
 */
export const todayQuery = queryOptions({
  queryKey: ["today"],
  queryFn: () => unwrap(api.GET("/api/today")),
})

/**
 * Past meals nobody marked. Under "plan", so a meal answered on another
 * phone leaves this one too.
 */
export const unmarkedQuery = queryOptions({
  queryKey: ["plan", "unmarked"],
  queryFn: () => unwrap(api.GET("/api/plan/unmarked")),
})
