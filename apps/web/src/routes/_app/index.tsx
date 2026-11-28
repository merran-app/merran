import { createFileRoute } from "@tanstack/react-router"

import { householdQuery } from "@/features/household/queries"
import { clockOf, todayPlanRange } from "@/features/plan/clock"
import { autoplanQuery, planQuery } from "@/features/plan/queries"
import { todayQuery, unmarkedQuery } from "@/features/today/queries"
import { TodayPage } from "@/features/today/today-page"
import { preloadQuery } from "@/lib/loaders"

export const Route = createFileRoute("/_app/")({
  loader: ({ context: { queryClient } }) => {
    // Signing in has loaded the household, so its clock is known here.
    const clock = clockOf(queryClient.getQueryData(householdQuery.queryKey))
    const { from, to } = todayPlanRange(clock)

    // Today shows at once, with skeletons where its data isn't in yet, so
    // the loader starts the requests with the page's code and doesn't wait
    // for them. They can't fail the loader: preloadQuery never rejects.
    void preloadQuery(queryClient, planQuery(from, to))
    void preloadQuery(queryClient, todayQuery)
    void preloadQuery(queryClient, unmarkedQuery)
    void preloadQuery(queryClient, autoplanQuery)
  },
  component: TodayPage,
})
