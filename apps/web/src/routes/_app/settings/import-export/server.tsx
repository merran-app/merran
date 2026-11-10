import { createFileRoute } from "@tanstack/react-router"

import { FlareSolverrCard } from "@/features/server/flaresolverr-card"
import { serverSettingsQuery } from "@/features/server/queries"
import { SitesCard } from "@/features/server/sites-card"
import { VideoCard } from "@/features/server/video-card"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"

/** Settings → Import and export → Whole server: how Merran reads recipe sites and video links. */
export const Route = createFileRoute("/_app/settings/import-export/server")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "importExport", "server"),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(serverSettingsQuery),
  component: ServerImportExportSettings,
})

function ServerImportExportSettings() {
  return (
    <TopicPage page="importExport" half="server">
      <SitesCard />
      <VideoCard />
      <FlareSolverrCard />
    </TopicPage>
  )
}
