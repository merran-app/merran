import { createFileRoute } from "@tanstack/react-router"

import { meQuery } from "@/features/auth/queries"
import { useActiveHousehold } from "@/features/auth/use-me"
import { DetailsCard } from "@/features/household/details-card"
import { InvitesCard } from "@/features/household/invites-card"
import { MembersCard } from "@/features/household/members-card"
import {
  householdQuery,
  invitesQuery,
  isAdminRole,
  membersQuery,
} from "@/features/household/queries"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { viewerFrom } from "@/features/settings/pages"
import { TopicPage } from "@/features/settings/topic-page"

/** Settings → Household, the household's half: its details and its people. */
export const Route = createFileRoute("/_app/settings/household/")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "household", "household"),
  loader: async ({ context: { queryClient } }) => {
    const me = await queryClient.ensureQueryData(meQuery)
    const role = me ? viewerFrom(me).householdRole : null
    await Promise.all([
      queryClient.ensureQueryData(householdQuery),
      queryClient.ensureQueryData(membersQuery),
      isAdminRole(role ?? undefined) &&
        queryClient.ensureQueryData(invitesQuery),
    ])
  },
  component: HouseholdSettings,
})

function HouseholdSettings() {
  const canManage = isAdminRole(useActiveHousehold()?.role)

  return (
    <TopicPage page="household" half="household">
      <DetailsCard />
      <MembersCard />
      {canManage && <InvitesCard />}
    </TopicPage>
  )
}
