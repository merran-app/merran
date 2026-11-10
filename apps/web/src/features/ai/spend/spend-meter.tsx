import { Alert02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

import { formatMoney } from "../queries"

/** Whose keys a figure is for, which picks its color. */
export type SpendSeries = "server" | "own"

export const SERIES_FILL: Record<SpendSeries, string> = {
  server: "bg-spend-server",
  own: "bg-spend-own",
}

/**
 * What's spent against a monthly limit: the amounts, a bar, and what's left,
 * or a word with an icon when it's close or there. Never color alone.
 */
export function SpendMeter({
  label,
  spent,
  limit,
  series,
  near,
  status,
}: {
  label: ReactNode
  spent: number
  limit: number | null
  series: SpendSeries
  near: boolean
  /** Says something else in place of what's left, like a household not being covered. */
  status?: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const money = (dollars: number) => formatMoney(dollars, i18n.language)
  const reached = limit !== null && spent >= limit
  const share = limit ? Math.min(1, spent / limit) : null

  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="min-w-0 font-medium">{label}</span>
        <span className="tabular-nums">
          {money(spent)}
          {limit !== null && (
            <span className="text-muted-foreground">
              {" "}
              {t("ai.spend.ofLimit", { limit: money(limit) })}
            </span>
          )}
        </span>
      </div>
      {share !== null && limit !== null && (
        <div
          role="meter"
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(spent, limit)}
          aria-valuetext={`${money(spent)} ${t("ai.spend.ofLimit", { limit: money(limit) })}`}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn("h-full rounded-full", SERIES_FILL[series])}
            style={{ width: `${share * 100}%` }}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {status ? (
          status
        ) : reached ? (
          <StatusChip tone="danger">{t("ai.spend.limitReached")}</StatusChip>
        ) : near ? (
          <StatusChip tone="warning">{t("ai.spend.nearLimit")}</StatusChip>
        ) : limit !== null ? (
          <span>{t("ai.spend.left", { left: money(limit - spent) })}</span>
        ) : (
          <span>{t("ai.spend.noLimit")}</span>
        )}
      </div>
    </div>
  )
}

/** A state that needs noticing: an icon and a word on a tint. */
export function StatusChip({
  tone,
  children,
}: {
  tone: "warning" | "danger"
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "warning" &&
          "bg-amber-500/15 text-amber-800 dark:text-amber-300",
        tone === "danger" && "bg-destructive/10 text-destructive"
      )}
    >
      <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-3.5" />
      {children}
    </span>
  )
}
