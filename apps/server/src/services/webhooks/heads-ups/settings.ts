import { DEFAULT_SUMMARY_AT } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { Household } from "../../../database/entities/index.ts"

// When the household's daily heads-ups go: Daily summary at, on the
// Webhooks page. One time for the household, for every webhook that wants
// `day.summary` or `pantry.use_soon`.

/** What the Webhooks page shows and saves. */
export type HeadsUpSchedule = { summaryAt: string }

/** When the daily heads-ups go, as HH:mm on the household's clock. */
export function summaryAtOf(household: Household): string {
  return household.settings?.webhooks?.summaryAt ?? DEFAULT_SUMMARY_AT
}

export async function getHeadsUpSchedule(
  em: EntityManager,
  householdId: string
): Promise<HeadsUpSchedule> {
  const household = await em.findOneOrFail(Household, { id: householdId })
  return { summaryAt: summaryAtOf(household) }
}

/**
 * Saves when the daily heads-ups go. A time already gone by today waits
 * for tomorrow, and one still to come today sends today's once, unless
 * it's been sent.
 */
export async function saveHeadsUpSchedule(
  em: EntityManager,
  householdId: string,
  input: HeadsUpSchedule
): Promise<HeadsUpSchedule> {
  const household = await em.findOneOrFail(Household, { id: householdId })
  household.settings = {
    ...household.settings,
    webhooks: { ...household.settings?.webhooks, summaryAt: input.summaryAt },
  }
  await em.flush()
  return { summaryAt: summaryAtOf(household) }
}
