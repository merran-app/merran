import { clockIn, plannedMeals } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { Household } from "../../database/entities/index.ts"

/** The household's today, in its time zone. */
export async function householdToday(em: EntityManager, householdId: string) {
  const household = await em.findOneOrFail(Household, { id: householdId })
  return clockIn(household.timeZone).today
}

/**
 * The household's day and hour, its time zone, the day its week starts,
 * and the meals it plans.
 */
export async function householdClock(em: EntityManager, householdId: string) {
  const household = await em.findOneOrFail(Household, { id: householdId })
  return {
    ...clockIn(household.timeZone),
    timeZone: household.timeZone,
    weekStartsOn: household.weekStartsOn,
    meals: plannedMeals(household.settings?.meals),
  }
}

/**
 * Midday on a day, where the household is: when a meal from a day gone by
 * was cooked, as near as anyone can say.
 */
export function middayOn(day: string, timeZone: string) {
  const guess = new Date(`${day}T12:00:00Z`)
  const there = clockIn(timeZone, guess)
  // How far the household's clock is from UTC's at that moment, in hours.
  const days = Math.round(
    (Date.parse(`${there.today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) /
      86_400_000
  )
  const ahead = there.hour - 12 + days * 24
  const minutes = minutesPast(timeZone, guess)
  return new Date(guess.getTime() - ahead * 3_600_000 - minutes * 60_000)
}

/** The minutes past the hour on the household's clock: India's is half past. */
function minutesPast(timeZone: string, at: Date) {
  try {
    const minute = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      minute: "2-digit",
    })
      .formatToParts(at)
      .find((part) => part.type === "minute")?.value
    return Number(minute ?? 0)
  } catch {
    return 0
  }
}
