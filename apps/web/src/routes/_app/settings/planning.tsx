import { createFileRoute } from "@tanstack/react-router"

import { meQuery } from "@/features/auth/queries"
import { useActiveHousehold } from "@/features/auth/use-me"
import { AutoplanCard } from "@/features/household/autoplan-card"
import { CalendarCard } from "@/features/household/calendar-card"
import { PlanningCard } from "@/features/household/planning-card"
import {
  householdQuery,
  isAdminRole,
  tastesQuery,
  themesQuery,
} from "@/features/household/queries"
import { TastesCard } from "@/features/household/tastes-card"
import { ThemeNightsCard } from "@/features/household/theme-nights-card"
import { calendarSettingsQuery } from "@/features/plan/calendar-queries"
import { autoplanQuery } from "@/features/plan/queries"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { viewerFrom } from "@/features/settings/pages"
import { TopicPage } from "@/features/settings/topic-page"

/** Settings → Planning: which meals fill, tastes, theme nights, the weekly plan and calendars. */
export const Route = createFileRoute("/_app/settings/planning")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "planning", "household"),
  loader: async ({ context: { queryClient } }) => {
    const me = await queryClient.ensureQueryData(meQuery)
    const admin = isAdminRole(
      (me ? viewerFrom(me).householdRole : null) ?? undefined
    )
    await Promise.all([
      queryClient.ensureQueryData(householdQuery),
      queryClient.ensureQueryData(calendarSettingsQuery),
      queryClient.ensureQueryData(tastesQuery),
      admin && queryClient.ensureQueryData(themesQuery),
      admin && queryClient.ensureQueryData(autoplanQuery),
    ])
  },
  component: PlanningSettings,
})

function PlanningSettings() {
  const canManage = isAdminRole(useActiveHousehold()?.role)

  return (
    <TopicPage page="planning" half="household">
      {canManage && <PlanningCard />}
      <TastesCard />
      {canManage && <ThemeNightsCard />}
      {canManage && <AutoplanCard />}
      <CalendarCard canManage={canManage} />
    </TopicPage>
  )
}
