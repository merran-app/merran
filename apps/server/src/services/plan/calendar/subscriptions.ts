import { createHash, randomBytes, randomUUID } from "node:crypto"
import type { EntityManager } from "@mikro-orm/sql"
import { mealTimes, type MealTimes } from "@merran/shared"
import {
  CalendarSubscription,
  Household,
  HouseholdMember,
} from "../../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../../database/scope.ts"
import { AppError } from "../../../core/errors.ts"

const hash = (token: string) => createHash("sha256").update(token).digest("hex")

export function calendarSettings(household: Household) {
  const saved = household.settings?.calendar
  return { enabled: saved?.enabled ?? false, times: mealTimes(saved?.times) }
}

export async function changeCalendarSettings(
  em: EntityManager,
  household: Household,
  changes: { enabled?: boolean; times?: MealTimes }
) {
  const prior = household.settings?.calendar
  const next = {
    enabled: changes.enabled ?? prior?.enabled ?? false,
    times: changes.times ?? mealTimes(prior?.times),
    namespace: prior?.namespace ?? randomUUID(),
  }
  household.settings = { ...household.settings, calendar: next }
  if (!next.enabled) {
    await em.nativeUpdate(
      CalendarSubscription,
      { household: household.id, revokedAt: null },
      { revokedAt: new Date() }
    )
  }
  await em.flush()
  return calendarSettings(household)
}

export async function createCalendarSubscription(
  em: EntityManager,
  householdId: string,
  userId: string
) {
  const household = await em.findOneOrFail(Household, householdId)
  if (!household.settings?.calendar?.enabled) {
    throw new AppError(
      "forbidden",
      "calendar_disabled",
      "Enable the calendar first."
    )
  }
  const token = randomBytes(32).toString("base64url")
  const link = em.create(CalendarSubscription, {
    household: householdId,
    user: userId,
    tokenHash: hash(token),
  })
  await em.flush()
  return { link, token }
}

/** Resolve only by the bearer token, then recheck membership on every fetch. */
export async function calendarForToken(em: EntityManager, token: string) {
  const link = await em.findOne(
    CalendarSubscription,
    { tokenHash: hash(token), revokedAt: null },
    { ...ACROSS_HOUSEHOLDS, populate: ["household"] }
  )
  if (!link) return null
  const household = link.household.getEntity()
  if (!household.settings?.calendar?.enabled) return null
  const member = await em.findOne(
    HouseholdMember,
    { household: household.id, user: link.user.id },
    ACROSS_HOUSEHOLDS
  )
  return member ? household : null
}
