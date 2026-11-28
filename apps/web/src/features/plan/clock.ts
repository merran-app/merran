import {
  addDays,
  clockIn,
  plannedMeals,
  weekStartOf,
  type Meal,
} from "@merran/shared"

export type HouseholdClock = {
  today: string
  hour: number
  weekStartsOn: number
  meals: Meal[]
  thisWeek: string
}

/**
 * The household's clock: today and the hour in its time zone, its week's
 * first day, and the meals it plans. Without the household yet, UTC and
 * weeks from Monday. Today is the household's, so everyone in it sees the
 * same day.
 */
export function clockOf(
  household:
    | { timeZone: string; weekStartsOn: number; meals: Meal[] | null }
    | undefined,
  now?: Date
): HouseholdClock {
  const timeZone = household?.timeZone ?? "UTC"
  const weekStartsOn = household?.weekStartsOn ?? 1
  const { today, hour } = clockIn(timeZone, now)
  return {
    today,
    hour,
    weekStartsOn,
    meals: plannedMeals(household?.meals),
    thisWeek: weekStartOf(today, weekStartsOn),
  }
}

/** What Today asks the plan for: this week's first day to a week from today. */
export function todayPlanRange(clock: HouseholdClock) {
  return { from: clock.thisWeek, to: addDays(clock.today, 7) }
}

/** What the plan page asks for: the week of the day asked, or this week. */
export function weekShown(asked: string | undefined, clock: HouseholdClock) {
  const from = weekStartOf(asked ?? clock.today, clock.weekStartsOn)
  return { from, to: addDays(from, 6) }
}
