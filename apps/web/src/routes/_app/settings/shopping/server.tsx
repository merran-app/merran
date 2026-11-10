import { createFileRoute } from "@tanstack/react-router"

import { KrogerCard } from "@/features/server/kroger-card"
import { serverSettingsQuery } from "@/features/server/queries"
import { WalmartCard } from "@/features/server/walmart-card"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"

/** Settings → Shopping and stores → Whole server: the retailers households can connect. */
export const Route = createFileRoute("/_app/settings/shopping/server")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "shopping", "server"),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(serverSettingsQuery),
  component: ServerShoppingSettings,
})

function ServerShoppingSettings() {
  return (
    <TopicPage page="shopping" half="server">
      <KrogerCard />
      <WalmartCard />
    </TopicPage>
  )
}
