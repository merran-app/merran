import { isDay } from "@merran/shared"
import { createFileRoute } from "@tanstack/react-router"

import { householdQuery, themesQuery } from "@/features/household/queries"
import {
  calendarSettingsQuery,
  calendarSlotTimesQuery,
} from "@/features/plan/calendar-queries"
import { clockOf, weekShown } from "@/features/plan/clock"
import { PlanPage } from "@/features/plan/plan-page"
import { planQuery } from "@/features/plan/queries"
import { preloadQuery } from "@/lib/loaders"

type PlanSearch = { week?: string }

/** The week plan; `?week=` is any day of the week to show. */
export const Route = createFileRoute("/_app/plan")({
  validateSearch: (search: Record<string, unknown>): PlanSearch =>
    typeof search.week === "string" && isDay(search.week)
      ? { week: search.week }
      : {},
  loaderDeps: ({ search }) => ({ week: search.week }),
  loader: ({ context: { queryClient }, deps }) => {
    // Signing in has loaded the household, so its clock is known here.
    const clock = clockOf(queryClient.getQueryData(householdQuery.queryKey))
    const { from, to } = weekShown(deps.week, clock)

    // The plan shows at once, with skeletons where its data isn't in yet, so
    // the loader starts the requests with the page's code and doesn't wait
    // for them. They can't fail the loader: preloadQuery never rejects.
    void preloadQuery(queryClient, planQuery(from, to))
    void preloadQuery(queryClient, calendarSettingsQuery)
    void preloadQuery(queryClient, calendarSlotTimesQuery(from, to))
    void preloadQuery(queryClient, themesQuery)
  },
  component: PlanRoute,
})

function PlanRoute() {
  const { week } = Route.useSearch()
  return <PlanPage week={week} />
}
