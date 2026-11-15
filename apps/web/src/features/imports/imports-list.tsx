import { ArrowRight01Icon, Download04Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { formatRelativeDate } from "@/lib/format"

import { importSummary } from "./import-summary"
import { isGoing, type Import } from "./queries"

/** What an import was: its kind, and its link, file or collection. */
export function useImportTitle() {
  const { t } = useTranslation()
  return (found: Import) => ({
    title: t(`imports.kind.${found.kind}`),
    detail:
      found.source ??
      (found.kind === "links"
        ? t("imports.links", { count: found.total })
        : null),
  })
}

/** An import's line: "48 came in, 3 already here, 1 didn't". */
export function useSummaryText() {
  const { t } = useTranslation()
  return (found: Import) =>
    importSummary(found)
      // Keys from importSummary, all under imports.summary.
      .map((part) => String(t(part.key as never, part.values)))
      .join(", ")
}

/** Every import, newest first: what it was, who, when, and how it went. */
export function ImportsList({ imports }: { imports: Import[] }) {
  const { t, i18n } = useTranslation()
  const titleOf = useImportTitle()
  const summaryOf = useSummaryText()

  if (imports.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>{t("imports.empty")}</EmptyTitle>
          <EmptyDescription>{t("imports.emptyDescription")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ul className="grid divide-y rounded-3xl border bg-card">
      {imports.map((found) => {
        const { title, detail } = titleOf(found)
        const when = formatRelativeDate(found.createdAt, i18n.language)
        return (
          <li key={found.id}>
            <Link
              to="/recipes/imports/$importId"
              params={{ importId: found.id }}
              className="flex items-center gap-3 p-4 hover:bg-muted/50"
            >
              <div className="grid min-w-0 flex-1 gap-0.5">
                {/* A long link shortens to fit rather than running off. */}
                <span className="flex min-w-0 items-baseline gap-2 font-medium">
                  <span className="shrink-0">{title}</span>
                  {detail && (
                    <span className="min-w-0 truncate font-normal text-muted-foreground">
                      {detail}
                    </span>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">
                  {found.startedBy
                    ? t("imports.by", { name: found.startedBy.name, when })
                    : t("imports.byMerran", { when })}
                </span>
                <span className="text-sm">{summaryOf(found)}</span>
              </div>
              {isGoing(found) && <Spinner />}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100"
              />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
