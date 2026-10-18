// Days are UTC dates, "2026-10-17": the receiver never keeps a time.

export function utcDay(date: Date) {
  return date.toISOString().slice(0, 10)
}

/** The day so many days later, or earlier for a negative number. */
export function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return utcDay(date)
}
