import { createFileRoute } from "@tanstack/react-router"

import { OAuthClientsCard } from "@/features/server/oauth-clients-card"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"

/** Settings → Apps and devices → Whole server: the apps registered to sign in with Merran. */
export const Route = createFileRoute("/_app/settings/apps/server")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "apps", "server"),
  component: ServerAppsSettings,
})

function ServerAppsSettings() {
  return (
    <TopicPage page="apps" half="server">
      <OAuthClientsCard />
    </TopicPage>
  )
}
