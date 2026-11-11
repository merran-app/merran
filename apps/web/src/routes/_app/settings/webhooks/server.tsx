import { createFileRoute } from "@tanstack/react-router"

import { serverAiQuery } from "@/features/ai/queries"
import { serverSettingsQuery } from "@/features/server/queries"
import { WebhooksCard } from "@/features/server/webhooks-card"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"

/** Settings → Webhooks → Whole server: webhooks on or off, and who may reach the home network. */
export const Route = createFileRoute("/_app/settings/webhooks/server")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "webhooks", "server"),
  // The server's households, to choose which may reach the home network.
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(serverSettingsQuery),
      queryClient.ensureQueryData(serverAiQuery),
    ]),
  component: ServerWebhooksSettings,
})

function ServerWebhooksSettings() {
  return (
    <TopicPage page="webhooks" half="server">
      <WebhooksCard />
    </TopicPage>
  )
}
