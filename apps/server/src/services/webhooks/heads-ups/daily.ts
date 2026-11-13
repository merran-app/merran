import { addDays, USE_SOON_DAYS, weekStartOf } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  PantryItem,
  PlanEntry,
  ShoppingItem,
  WebhookEvent,
  type Household,
} from "../../../database/entities/index.ts"
import { NOT_DELETED_FILTER } from "../../../database/scope.ts"
import { mealRef } from "../events/plan.ts"
import type { EventData, UseSoonItem } from "../payloads.ts"
import { sendEvent, sentWithKey } from "../record.ts"
import { slotsOn } from "./slots.ts"

// The daily run: `day.summary` and `pantry.use_soon`, at the household's
// Daily summary at time. Each is keyed by its day, so it goes once however
// the schedule's runs fall.

/** What the daily run is told: the household, its day and the moment. */
export type DailyRun = { household: Household; today: string; now: Date }

const summaryKey = (day: string) => `day.summary:${day}`
const useSoonKey = (day: string) => `pantry.use_soon:${day}`

/** Sends today's summary, unless it's been sent. Says whether it was. */
export async function sendDaySummary(
  em: EntityManager,
  run: DailyRun
): Promise<boolean> {
  const { household, today, now } = run
  const key = summaryKey(today)
  // Asked first, so a run that finds it sent builds nothing.
  if (await sentWithKey(em, household.id, key)) return false

  const sent = await sendEvent(em, household.id, {
    type: "day.summary",
    data: await daySummary(em, run),
    createdAt: now,
    key,
  })
  return sent !== null
}

/** The day ahead: its meals, the week's pool, what to use soon, the list. */
async function daySummary(
  em: EntityManager,
  { household, today }: DailyRun
): Promise<EventData<"day.summary">> {
  const [slots, pool, useSoon, items] = await Promise.all([
    slotsOn(em, household, [today], ["planned", "cooked"]),
    poolOf(em, weekStartOf(today, household.weekStartsOn)),
    useSoonBy(em, addDays(today, USE_SOON_DAYS)),
    em.count(ShoppingItem, { checked: false }),
  ])

  return {
    date: today,
    meals: slots.map(({ meal, time, dishes }) => ({ meal, time, dishes })),
    pool,
    useSoon: useSoon.map(asUseSoon),
    list: { items },
  }
}

/** The meals in a week's pool that are still to be made, as events name them. */
async function poolOf(em: EntityManager, week: string) {
  const entries = await em.find(
    PlanEntry,
    { date: week, anyDay: true, status: "planned" },
    {
      populate: ["recipe", "withRecipe"],
      filters: { [NOT_DELETED_FILTER]: false },
      orderBy: { position: "asc", createdAt: "asc" },
    }
  )
  const shown = entries.filter((entry) => !entry.recipe?.getEntity().deletedAt)
  const meals = []
  for (const entry of shown) meals.push(await mealRef(em, entry))
  return meals
}

/** What's at home with a use-by day on or before `until`, soonest first. */
function useSoonBy(em: EntityManager, until: string) {
  return em.find(
    PantryItem,
    { useBy: { $ne: null, $lte: until } },
    { orderBy: { useBy: "asc", name: "asc" } }
  )
}

function asUseSoon(item: PantryItem): UseSoonItem {
  return {
    id: item.id,
    name: item.name,
    place: item.storedIn ?? null,
    useBy: item.useBy!,
  }
}

/**
 * Sends what's come into the use-soon window since this was last sent:
 * what's now within `USE_SOON_DAYS` of its use-by day, less what was then
 * (it was there already, and its day was in that run's window). Nothing is
 * sent when nothing has. Says whether it was.
 */
export async function sendUseSoon(
  em: EntityManager,
  run: DailyRun
): Promise<boolean> {
  const { household, today, now } = run
  const key = useSoonKey(today)
  if (await sentWithKey(em, household.id, key)) return false

  const close = await useSoonBy(em, addDays(today, USE_SOON_DAYS))
  const last = await lastUseSoon(em)
  const fresh = last
    ? close.filter(
        (item) =>
          item.createdAt > last.at ||
          item.useBy! > addDays(last.day, USE_SOON_DAYS)
      )
    : close
  if (fresh.length === 0) return false

  const sent = await sendEvent(em, household.id, {
    type: "pantry.use_soon",
    data: { items: fresh.map(asUseSoon) },
    createdAt: now,
    key,
  })
  return sent !== null
}

/**
 * When `pantry.use_soon` was last sent, and for which day. Events are kept
 * 30 days, so after a month without one the next lists everything close.
 */
async function lastUseSoon(
  em: EntityManager
): Promise<{ at: Date; day: string } | null> {
  const last = await em.findOne(
    WebhookEvent,
    { type: "pantry.use_soon", key: { $ne: null } },
    { orderBy: { createdAt: "desc" } }
  )
  const day = last?.key?.slice(useSoonKey("").length)
  return last && day ? { at: last.createdAt, day } : null
}
