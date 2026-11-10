/** A month's AI spend, on the server's keys and on the household's own. */
export type SpendMonth = {
  month: string
  server: number
  own: number
  calls: number
}

/** "2026-10" for "2026-11". */
export function previousMonth(month: string) {
  const [year, number] = month.split("-").map(Number)
  const date = new Date(Date.UTC(year ?? 1970, (number ?? 1) - 2, 1))
  return date.toISOString().slice(0, 7)
}

/** This month, as "2026-11", by the server's reckoning in UTC. */
export function thisMonth() {
  return new Date().toISOString().slice(0, 7)
}

/** "November", or "Nov" when short. */
export function monthName(
  month: string,
  language: string,
  style: "long" | "short" = "long"
) {
  return new Intl.DateTimeFormat(language, {
    month: style,
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`))
}

/** The last six months up to and including this one, oldest first, with nothing spent filled in. */
export function lastSixMonths(spend: SpendMonth[], current: string) {
  const months: SpendMonth[] = []
  let month = current
  for (let i = 0; i < 6; i++) {
    months.unshift(
      spend.find((each) => each.month === month) ?? {
        month,
        server: 0,
        own: 0,
        calls: 0,
      }
    )
    month = previousMonth(month)
  }
  return months
}
