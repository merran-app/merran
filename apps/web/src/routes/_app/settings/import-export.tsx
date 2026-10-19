import { createFileRoute, redirect } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { meQuery } from "@/features/auth/queries"
import { isAdminRole } from "@/features/household/queries"
import { SettingsPage } from "@/features/settings/settings-page"
import { AppImportCard } from "@/features/transfer/app-import-card"
import { ExportCard } from "@/features/transfer/export-card"
import { ImportCard } from "@/features/transfer/import-card"

/** Settings → Import and export: for the household's owners and admins. */
export const Route = createFileRoute("/_app/settings/import-export")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    const active = me?.households.find((h) => h.id === me.activeHouseholdId)
    if (!isAdminRole(active?.role)) throw redirect({ to: "/settings/you" })
  },
  component: ImportExportSettings,
})

function ImportExportSettings() {
  const { t } = useTranslation()

  return (
    <SettingsPage
      groups={[
        {
          id: "move-a-household",
          title: t("settings.transfer.groups.household.title"),
          description: t("settings.transfer.groups.household.description"),
          content: (
            <>
              <ExportCard />
              <ImportCard />
            </>
          ),
        },
        {
          id: "import-from-another-app",
          title: t("settings.transfer.groups.apps.title"),
          description: t("settings.transfer.groups.apps.description"),
          content: <AppImportCard />,
        },
      ]}
    />
  )
}
