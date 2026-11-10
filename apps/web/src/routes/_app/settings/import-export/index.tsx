import { createFileRoute } from "@tanstack/react-router"

import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"
import { AppImportCard } from "@/features/transfer/app-import-card"
import { ExportCard } from "@/features/transfer/export-card"
import { ImportCard } from "@/features/transfer/import-card"

/** Settings → Import and export, the household's half: move a household, or bring recipes from another app. */
export const Route = createFileRoute("/_app/settings/import-export/")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "importExport", "household"),
  component: ImportExportSettings,
})

function ImportExportSettings() {
  return (
    <TopicPage page="importExport" half="household">
      <ExportCard />
      <ImportCard />
      <AppImportCard />
    </TopicPage>
  )
}
