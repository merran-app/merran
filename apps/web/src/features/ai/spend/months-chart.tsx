import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

import { formatMoney } from "../queries"
import { monthName, type SpendMonth } from "./months"
import { SERIES_FILL, type SpendSeries } from "./spend-meter"

/**
 * Six months of spend as columns, the server's keys at the base and the
 * household's own stacked on top, each month's total written under it.
 * Hovering or focusing a month shows its split.
 */
export function MonthsChart({
  months,
  current,
  showOwn,
}: {
  months: SpendMonth[]
  current: string
  /** Both series, with a legend; or only the server's keys. */
  showOwn: boolean
}) {
  const { t, i18n } = useTranslation()
  const money = (dollars: number) => formatMoney(dollars, i18n.language)
  const total = (month: SpendMonth) => month.server + (showOwn ? month.own : 0)
  const highest = Math.max(...months.map(total), 0.01)

  return (
    <figure className="grid gap-3">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-sm font-medium">
          {t("ai.spend.lastSixMonths")}
        </span>
        {showOwn && (
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <LegendItem series="server" label={t("ai.household.serverKeys")} />
            <LegendItem series="own" label={t("ai.household.ownKeys")} />
          </span>
        )}
      </figcaption>
      <ul className="grid h-36 grid-cols-6 items-end gap-2 border-b sm:gap-4">
        {months.map((month, index) => (
          <li
            key={month.month}
            tabIndex={0}
            aria-label={describe(month)}
            className="group relative flex h-full flex-col justify-end gap-0.5 rounded-t-md px-1.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:px-3"
          >
            {showOwn && month.own > 0 && (
              <Segment series="own" share={month.own / highest} top />
            )}
            {month.server > 0 && (
              <Segment
                series="server"
                share={month.server / highest}
                top={!showOwn || month.own === 0}
              />
            )}
            <Tooltip
              month={month}
              edge={
                index === 0
                  ? "start"
                  : index === months.length - 1
                    ? "end"
                    : null
              }
            />
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-6 gap-2 text-center text-xs tabular-nums sm:gap-4">
        {months.map((month) => (
          <span
            key={month.month}
            aria-hidden="true"
            className={cn(
              "grid gap-0.5",
              month.month === current
                ? "text-foreground"
                : "text-muted-foreground"
            )}
          >
            <span>{monthName(month.month, i18n.language, "short")}</span>
            <span>{money(total(month))}</span>
          </span>
        ))}
      </div>
    </figure>
  )

  /** A month in words, for screen readers. */
  function describe(month: SpendMonth) {
    const parts = [
      monthName(month.month, i18n.language),
      `${t("ai.household.serverKeys")} ${money(month.server)}`,
      showOwn ? `${t("ai.household.ownKeys")} ${money(month.own)}` : null,
      t("ai.spend.calls", { count: month.calls }),
    ]
    return parts.filter(Boolean).join(", ")
  }

  /**
   * A month's split, above its column. The first and last line up with the
   * chart's edge instead of centering, so they stay inside the card on a phone.
   */
  function Tooltip({
    month,
    edge,
  }: {
    month: SpendMonth
    edge: "start" | "end" | null
  }) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none invisible absolute bottom-full z-10 mb-2 grid w-max gap-1 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md group-hover:visible group-focus-visible:visible",
          edge === "start" && "start-0",
          edge === "end" && "end-0",
          edge === null && "left-1/2 -translate-x-1/2"
        )}
      >
        <span className="font-medium">
          {monthName(month.month, i18n.language)}
        </span>
        <TooltipRow
          series="server"
          label={t("ai.household.serverKeys")}
          value={money(month.server)}
        />
        {showOwn && (
          <TooltipRow
            series="own"
            label={t("ai.household.ownKeys")}
            value={money(month.own)}
          />
        )}
        <span className="text-muted-foreground tabular-nums">
          {t("ai.spend.calls", { count: month.calls })}
        </span>
      </div>
    )
  }
}

/** One series' part of a month's column: rounded where it ends, square at the base. */
function Segment({
  series,
  share,
  top,
}: {
  series: SpendSeries
  share: number
  top: boolean
}) {
  return (
    <span
      className={cn("block w-full", SERIES_FILL[series], top && "rounded-t")}
      style={{ height: `${Math.max(share * 100, 1.5)}%` }}
    />
  )
}

function LegendItem({ series, label }: { series: SpendSeries; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-xs", SERIES_FILL[series])} />
      {label}
    </span>
  )
}

function TooltipRow({
  series,
  label,
  value,
}: {
  series: SpendSeries
  label: string
  value: string
}) {
  return (
    <span className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("size-2 rounded-xs", SERIES_FILL[series])} />
        {label}
      </span>
      <span className="tabular-nums">{value}</span>
    </span>
  )
}
