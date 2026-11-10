import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/layout/page-header"
import { SettingsNav } from "@/features/settings/settings-nav"
import { useIsMobile } from "@/hooks/use-mobile"

export const Route = createFileRoute("/_app/settings")({
  component: SettingsLayout,
})

/**
 * Settings by topic: the pages beside the one that's open. On a phone,
 * Settings itself is the list of pages, and each page has its own way back.
 */
function SettingsLayout() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const onSettingsItself = useRouterState({
    select: (state) => isSettingsItself(state.location.pathname),
  })

  return (
    <>
      {(!isMobile || onSettingsItself) && (
        <PageHeader
          title={t("nav.settings")}
          description={t("settings.description")}
        />
      )}
      <div className="grid min-w-0 gap-8 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10">
        {!isMobile && <SettingsNav />}
        <div className="flex min-w-0 flex-col gap-6">
          <Outlet />
        </div>
      </div>
    </>
  )
}

function isSettingsItself(pathname: string) {
  return pathname === "/settings" || pathname === "/settings/"
}
