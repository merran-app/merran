import { createFileRoute } from "@tanstack/react-router"

import { NewHouseholdCard } from "@/features/household/new-household-card"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"

/** Settings → Household → Whole server: starting another household, which only the server admin can do. */
export const Route = createFileRoute("/_app/settings/household/server")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "household", "server"),
  component: ServerHouseholdSettings,
})

function ServerHouseholdSettings() {
  return (
    <TopicPage page="household" half="server">
      <NewHouseholdCard />
    </TopicPage>
  )
}
