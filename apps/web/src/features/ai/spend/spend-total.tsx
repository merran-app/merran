import { useTranslation } from "react-i18next"

import { formatMoney } from "../queries"
import { monthName, previousMonth, type SpendMonth } from "./months"

/**
 * This month's spend as one big number, with how many calls it took and how
 * it compares with last month.
 */
export function SpendTotal({
  months,
  current,
}: {
  months: SpendMonth[]
  current: string
}) {
  const { t, i18n } = useTranslation()
  const money = (dollars: number) => formatMoney(dollars, i18n.language)
  const total = (month: SpendMonth | undefined) =>
    month ? month.server + month.own : 0
  const now = months.find((month) => month.month === current)
  const before = months.find((month) => month.month === previousMonth(current))
  const change = total(now) - total(before)
  const lastName = monthName(previousMonth(current), i18n.language)

  return (
    <div className="grid gap-1">
      <p className="text-sm text-muted-foreground">
        {t("ai.spend.spentIn", { month: monthName(current, i18n.language) })}
      </p>
      <p className="font-heading text-5xl leading-none font-semibold tracking-tight tabular-nums">
        {money(total(now))}
      </p>
      <p className="text-sm text-muted-foreground tabular-nums">
        {t("ai.spend.calls", { count: now?.calls ?? 0 })}
        {before && Math.abs(change) >= 0.01 && (
          <>
            {" · "}
            {t(change > 0 ? "ai.spend.moreThan" : "ai.spend.lessThan", {
              amount: money(Math.abs(change)),
              month: lastName,
            })}
          </>
        )}
      </p>
    </div>
  )
}
