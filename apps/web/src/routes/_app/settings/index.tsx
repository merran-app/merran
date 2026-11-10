import { createFileRoute, Navigate } from "@tanstack/react-router"

import { useSettingsViewer } from "@/features/settings/guard"
import { visiblePages } from "@/features/settings/pages"
import { SettingsList } from "@/features/settings/settings-nav"
import { useIsMobile } from "@/hooks/use-mobile"

export const Route = createFileRoute("/_app/settings/")({
  component: SettingsIndex,
})

/**
 * On a phone, Settings is the list of pages. On a larger screen the list is
 * beside the page, so this opens the first one. Deciding here rather than in
 * beforeLoad means a window resized across the phone width never loops.
 */
function SettingsIndex() {
  const isMobile = useIsMobile()
  const first = visiblePages(useSettingsViewer())[0]

  if (isMobile || !first) return <SettingsList />
  return <Navigate to={first.to} replace />
}
