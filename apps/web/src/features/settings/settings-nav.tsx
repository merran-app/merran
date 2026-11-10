import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, useRouterState } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

import { useSettingsViewer } from "./guard"
import { pageAt, visiblePages } from "./pages"

/** Settings' pages: a row above the page on a tablet, beside it on larger screens. */
export function SettingsNav() {
  const { t } = useTranslation()
  const pages = visiblePages(useSettingsViewer())
  const current = useRouterState({
    select: (state) => pageAt(state.location.pathname),
  })

  return (
    <nav
      data-tour="page-actions"
      aria-label={t("settings.pagesLabel")}
      className="flex min-w-0 flex-row flex-wrap gap-1 lg:sticky lg:top-20 lg:flex-col lg:self-start"
    >
      {pages.map((page) => (
        <Link
          key={page.id}
          to={page.to}
          data-tour={page.id === "server" ? "server-settings" : undefined}
          aria-current={page.id === current ? "page" : undefined}
          className={cn(
            "rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
            page.id === current &&
              "bg-muted font-medium text-foreground hover:bg-muted"
          )}
        >
          {t(page.titleKey)}
        </Link>
      ))}
    </nav>
  )
}

/** Settings' pages on a phone, where Settings itself is this list. */
export function SettingsList() {
  const { t } = useTranslation()
  const pages = visiblePages(useSettingsViewer())

  return (
    <nav
      data-tour="page-actions"
      aria-label={t("settings.pagesLabel")}
      className="overflow-hidden rounded-3xl border bg-card"
    >
      <ul className="divide-y">
        {pages.map((page) => (
          <li key={page.id}>
            <Link
              to={page.to}
              data-tour={page.id === "server" ? "server-settings" : undefined}
              className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-muted focus-visible:bg-muted"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{t(page.titleKey)}</span>
                <span className="truncate text-sm text-muted-foreground">
                  {t(page.descriptionKey)}
                </span>
              </span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100"
              />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
