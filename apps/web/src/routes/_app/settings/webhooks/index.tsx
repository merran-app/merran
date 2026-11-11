import { createFileRoute } from "@tanstack/react-router"

import { webhooksQuery } from "@/features/household/webhooks/queries"
import { WebhooksCard } from "@/features/household/webhooks/webhooks-card"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"

/** Settings → Webhooks, the household's half: the tools it tells when things happen. */
export const Route = createFileRoute("/_app/settings/webhooks/")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "webhooks", "household"),
  // The guard lets in only the household's admins, with webhooks on.
  loader: ({ context }) => context.queryClient.ensureQueryData(webhooksQuery),
  component: WebhooksSettings,
})

function WebhooksSettings() {
  return (
    <TopicPage page="webhooks" half="household">
      <WebhooksCard />
    </TopicPage>
  )
}
