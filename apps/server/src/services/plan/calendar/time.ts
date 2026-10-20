/** Turn a household wall time into an instant without using the server's zone. */
export function calendarInstant(day: string, time: string, timeZone: string) {
  const year = Number(day.slice(0, 4))
  const month = Number(day.slice(5, 7))
  const date = Number(day.slice(8, 10))
  const hour = Number(time.slice(0, 2))
  const minute = Number(time.slice(3, 5))
  const wanted = Date.UTC(year, month - 1, date, hour, minute)
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })

  function wall(instant: number) {
    const parts = formatter.formatToParts(new Date(instant))
    const value = (kind: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === kind)?.value)
    return Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute")
    )
  }

  const offsets = new Set(
    [-36, -12, 0, 12, 36].map((hours) => {
      const at = wanted + hours * 3_600_000
      return wall(at) - at
    })
  )
  const candidates = [...offsets]
    .map((offset) => wanted - offset)
    .filter((instant) => wall(instant) === wanted)
    .sort((a, b) => a - b)
  if (candidates.length > 0) return new Date(candidates[0]!)

  // A spring-forward gap has no matching wall time. Use its first valid minute.
  const first = wanted - 36 * 3_600_000
  for (let at = first; at <= wanted + 36 * 3_600_000; at += 60_000) {
    if (wall(at) >= wanted) return new Date(at)
  }
  throw new Error(`No calendar time for ${day} ${time} in ${timeZone}`)
}
