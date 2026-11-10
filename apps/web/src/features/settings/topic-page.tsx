import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

import { useSettingsViewer } from "./guard"
import {
  missingHouseholdHalf,
  visiblePages,
  type HalfId,
  type SettingsPageId,
  type VisiblePage,
} from "./pages"

/**
 * One half of a settings page: its heading, the This household (or You) |
 * Whole server switch when someone can see both, and its cards.
 */
export function TopicPage({
  page: pageId,
  half,
  children,
}: {
  page: SettingsPageId
  half: HalfId
  children: ReactNode
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const viewer = useSettingsViewer()
  const page = visiblePages(viewer).find((each) => each.id === pageId)
  // With no switch to show the household's half, say why it isn't there.
  const missing =
    half === "server" ? missingHouseholdHalf(pageId, viewer) : null

  return (
    <section
      aria-labelledby={`${pageId}-title`}
      className="flex min-w-0 flex-col gap-4"
    >
      {isMobile && <BackToSettings />}
      <div className="space-y-1 border-b pb-4">
        <h2
          id={`${pageId}-title`}
          className="text-xl font-semibold tracking-tight"
        >
          {page ? t(page.titleKey) : null}
        </h2>
        {page && (
          <p className="text-sm text-muted-foreground">
            {t(page.descriptionKey)}
          </p>
        )}
        {missing && (
          <p className="text-sm text-muted-foreground">
            {t(`settings.halves.onlyServer.${missing}`)}
          </p>
        )}
      </div>
      {page && page.halves.length > 1 && (
        <HalfSwitch page={page} current={half} />
      )}
      {half === "server" && (
        <p className="rounded-xl bg-chart-5/15 px-4 py-3 text-sm font-medium">
          {t("settings.halves.serverNote")}
        </p>
      )}
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}

/** On a phone, the way back to the list of pages. */
function BackToSettings() {
  const { t } = useTranslation()

  return (
    <Link
      to="/settings"
      className="-ms-1 inline-flex w-fit items-center gap-1 rounded-lg py-1 pe-2 text-sm font-medium text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <HugeiconsIcon
        icon={ArrowLeft01Icon}
        strokeWidth={2}
        className="size-4 rtl:-scale-x-100"
      />
      {t("settings.back")}
    </Link>
  )
}

/**
 * The switch between a page's halves. Each half has its own address, so the
 * switch is a pair of links, and the server half is tinted so it's plain
 * which one is being changed.
 */
function HalfSwitch({ page, current }: { page: VisiblePage; current: HalfId }) {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t("settings.halves.label")}
      className="flex w-fit max-w-full flex-wrap gap-1 rounded-2xl bg-muted p-1"
    >
      {page.halves.map((half) => {
        const isCurrent = half.id === current
        return (
          <Link
            key={half.id}
            to={half.to}
            // A household half's address starts the server half's, so only an
            // exact match marks a half as the one open.
            activeOptions={{ exact: true }}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
              isCurrent && "text-foreground shadow-sm",
              isCurrent && half.id === "server" && "bg-chart-5/15",
              isCurrent && half.id !== "server" && "bg-background"
            )}
          >
            {t(`settings.halves.${half.id}`)}
          </Link>
        )
      })}
    </nav>
  )
}
