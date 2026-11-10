import { createFileRoute } from "@tanstack/react-router"

import { ApiKeysCard } from "@/features/account/api-keys-card"
import { ConnectedAppsCard } from "@/features/account/connected-apps-card"
import { apiKeysQuery } from "@/features/account/queries"
import { InstallCard } from "@/features/install/install-ui"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"
import { ShareCard } from "@/features/share/share-card"

/** Settings → Apps and devices, your half: Merran on your devices, and apps you've let in. */
export const Route = createFileRoute("/_app/settings/apps/")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "apps", "you"),
  loader: ({ context }) => context.queryClient.ensureQueryData(apiKeysQuery),
  component: AppsSettings,
})

function AppsSettings() {
  return (
    <TopicPage page="apps" half="you">
      <InstallCard />
      <ShareCard />
      <ConnectedAppsCard />
      <ApiKeysCard />
    </TopicPage>
  )
}
