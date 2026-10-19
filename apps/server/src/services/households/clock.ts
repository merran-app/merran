import { clockIn, plannedMeals } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { Household } from "../../database/entities/index.ts"

/** The household's today, in its time zone. */
export async function householdToday(em: EntityManager, householdId: string) {
  const household = await em.findOneOrFail(Household, { id: householdId })
  return clockIn(household.timeZone).today
}

/** The household's day and hour, the day its week starts, and the meals it plans. */
export async function householdClock(em: EntityManager, householdId: string) {
  const household = await em.findOneOrFail(Household, { id: householdId })
  return {
    ...clockIn(household.timeZone),
    weekStartsOn: household.weekStartsOn,
    meals: plannedMeals(household.settings?.meals),
  }
}
