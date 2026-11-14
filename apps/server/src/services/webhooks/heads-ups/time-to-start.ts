import { addDays } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { Household } from "../../../database/entities/index.ts"
import { sendEvent, sentWithKey } from "../record.ts"
import { longestDish, slotsOn, type Slot } from "./slots.ts"

// `meal.time_to_start`: when a meal is served, less its longest dish's
// time. Each meal sends it once, up to 15 minutes late, so a meal planned
// after its start has gone by says nothing.

/** How late "time to start" may still be sent. */
export const START_LATE_MS = 15 * 60_000

const startKey = (slot: Pick<Slot, "date" | "meal">) =>
  `meal.time_to_start:${slot.date}:${slot.meal}`

/**
 * Sends "time to start" for each meal whose start has come in the last 15
 * minutes and hasn't been sent. Yesterday's and tomorrow's meals are
 * looked at too, as a long dish can start the day before, and a meal just
 * after midnight was due just before it. Says how many were sent.
 */
export async function sendTimesToStart(
  em: EntityManager,
  run: { household: Household; today: string; now: Date }
): Promise<number> {
  const { household, today, now } = run
  const days = [addDays(today, -1), today, addDays(today, 1)]
  // Only dishes still to make: a meal made already needs no start.
  const slots = await slotsOn(em, household, days, ["planned"])

  let sent = 0
  for (const slot of slots) {
    const minutes = longestDish(slot.dishes)
    if (minutes === null) continue
    const startAt = new Date(slot.serveAt.getTime() - minutes * 60_000)
    const late = now.getTime() - startAt.getTime()
    if (late < 0 || late > START_LATE_MS) continue

    const key = startKey(slot)
    if (await sentWithKey(em, household.id, key)) continue
    const event = await sendEvent(em, household.id, {
      type: "meal.time_to_start",
      data: {
        date: slot.date,
        meal: slot.meal,
        time: slot.time,
        serveAt: slot.serveAt.toISOString(),
        startAt: startAt.toISOString(),
        minutes,
        dishes: slot.dishes,
      },
      createdAt: now,
      key,
    })
    if (event) sent += 1
  }
  return sent
}
