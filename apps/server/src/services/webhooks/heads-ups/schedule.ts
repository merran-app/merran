import { addDays, clockIn, HEADS_UP_EVENTS } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { Logger } from "pino"
import { Household, Job, Webhook } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { ACROSS_HOUSEHOLDS, forHousehold } from "../../../database/scope.ts"
import { enqueue } from "../../jobs/jobs.ts"
import type { JobHandler } from "../../jobs/runner.ts"
import { calendarInstant } from "../../plan/calendar/time.ts"
import { webhooksEnabled } from "../state.ts"
import { sendDaySummary, sendUseSoon } from "./daily.ts"
import { summaryAtOf } from "./settings.ts"
import { sendTimesToStart } from "./time-to-start.ts"

// The daily heads-ups (docs/webhooks.md, "Scheduled heads-ups"): one job,
// every 5 minutes, that looks only at households with an active webhook
// that wants one, and works in each one's time zone. It's queued only while
// some webhook on the server wants a heads-up, so a server without one has
// nothing new on its Jobs page every 5 minutes.

export const HEADS_UP_JOB = "webhooks.schedule"

/** How often the schedule runs. */
export const HEADS_UP_EVERY_MS = 5 * 60_000

/**
 * How long after midnight a time just before it still counts, as the first
 * run after a time like 23:58 comes after midnight there.
 */
const PAST_MIDNIGHT_MS = 15 * 60_000

type HeadsUpType = (typeof HEADS_UP_EVENTS)[number]

/** Each household that wants a heads-up, and which. */
type Wanting = Map<string, Set<HeadsUpType>>

/** What one run sent. */
type Sent = { summaries: number; useSoon: number; starts: number }

export const headsUpJob: JobHandler = {
  kind: HEADS_UP_JOB,
  async run({ em, payload, deps, logger }) {
    const now = new Date()
    // When the run before it was, so a daily time passed while the server
    // was off is still noticed.
    const since =
      typeof payload.since === "string"
        ? new Date(payload.since)
        : new Date(now.getTime() - HEADS_UP_EVERY_MS)
    try {
      return await sendHeadsUps(deps.database, { since, now }, logger)
    } finally {
      await scheduleHeadsUps(em, now)
    }
  },
}

/**
 * Whether runs are queued: only once the server's job runner has started,
 * like its other schedules. Tests run what they need by hand, so a run
 * never turns up in the middle of another test's jobs.
 */
let keeping = false

/** Starts the schedule, once the job runner has. */
export function startHeadsUps(em: EntityManager): Promise<Job | null> {
  keeping = true
  return scheduleHeadsUps(em)
}

/** Stops queueing runs, for tests that started them. */
export function stopHeadsUps() {
  keeping = false
}

/**
 * Makes sure the next run is waiting while a webhook wants a heads-up: at
 * the next 5-minute mark. Called when the server starts or webhooks are
 * turned on, when a webhook is saved, and by each run for the next.
 */
export async function scheduleHeadsUps(
  em: EntityManager,
  now = new Date()
): Promise<Job | null> {
  if (!keeping || !webhooksEnabled()) return null
  const waiting = await em.findOne(Job, {
    kind: HEADS_UP_JOB,
    status: "queued",
  })
  if (waiting) return waiting
  if ((await householdsWanting(em)).size === 0) return null

  const at = new Date(
    (Math.floor(now.getTime() / HEADS_UP_EVERY_MS) + 1) * HEADS_UP_EVERY_MS
  )
  return enqueue(em, {
    kind: HEADS_UP_JOB,
    // Like the server's other schedules, it can't be cancelled while it waits.
    key: `schedule:webhooks:${at.toISOString()}`,
    payload: { since: now.toISOString() },
    runAt: at,
    maxAttempts: 1,
  })
}

/**
 * Sends each household's heads-ups that are due: the daily ones on the
 * run that passes its Daily summary at time, and each meal's "time to
 * start" on any run within 15 minutes of it. One household that fails is
 * logged, and doesn't keep the others from theirs.
 */
export async function sendHeadsUps(
  database: Database,
  window: { since: Date; now: Date },
  logger?: Logger
): Promise<Sent> {
  const sent: Sent = { summaries: 0, useSoon: 0, starts: 0 }
  if (!webhooksEnabled()) return sent

  const wanting = await householdsWanting(database.em.fork())
  for (const [householdId, types] of wanting) {
    try {
      const em = forHousehold(database.em, householdId)
      const done = await headsUpsFor(em, householdId, types, window)
      sent.summaries += done.summaries
      sent.useSoon += done.useSoon
      sent.starts += done.starts
    } catch (err) {
      logger?.error(
        { err, householdId },
        "Couldn't send a household's heads-ups"
      )
    }
  }
  return sent
}

async function headsUpsFor(
  em: EntityManager,
  householdId: string,
  types: ReadonlySet<HeadsUpType>,
  { since, now }: { since: Date; now: Date }
): Promise<Sent> {
  const household = await em.findOneOrFail(Household, { id: householdId })
  const { today } = clockIn(household.timeZone, now)
  const run = { household, today, now }
  const sent: Sent = { summaries: 0, useSoon: 0, starts: 0 }

  if (dailyRunDue(household, today, { since, now })) {
    if (types.has("day.summary") && (await sendDaySummary(em, run))) {
      sent.summaries += 1
    }
    if (types.has("pantry.use_soon") && (await sendUseSoon(em, run))) {
      sent.useSoon += 1
    }
  }
  if (types.has("meal.time_to_start")) {
    sent.starts += await sendTimesToStart(em, run)
  }
  return sent
}

/**
 * Whether the household's Daily summary at time came since the last run,
 * on its own clock. Today's counts however late the run is, so a server
 * that was off sends it when it's back. Yesterday's counts only when this
 * is the first run after it, past midnight there; after longer, today's
 * waits for its own time. A time already gone by when a webhook is added,
 * or when it's changed, waits for the next day.
 */
function dailyRunDue(
  household: Household,
  today: string,
  { since, now }: { since: Date; now: Date }
): boolean {
  const summaryAt = summaryAtOf(household)
  const todays = calendarInstant(today, summaryAt, household.timeZone)
  if (todays > since && todays <= now) return true

  const yesterday = addDays(today, -1)
  const yesterdays = calendarInstant(yesterday, summaryAt, household.timeZone)
  return (
    yesterdays > since &&
    now.getTime() - yesterdays.getTime() <= PAST_MIDNIGHT_MS
  )
}

/**
 * The households with an active webhook that wants a heads-up, and which,
 * across the server: a webhook that wants everything wants them all.
 */
async function householdsWanting(em: EntityManager): Promise<Wanting> {
  const webhooks = await em.find(
    Webhook,
    { state: "active" },
    { ...ACROSS_HOUSEHOLDS, fields: ["household", "events", "everything"] }
  )
  const wanting: Wanting = new Map()
  for (const webhook of webhooks) {
    const types = HEADS_UP_EVENTS.filter(
      (type) => webhook.everything || webhook.events.includes(type)
    )
    if (types.length === 0) continue
    const householdId = webhook.household.id
    const known = wanting.get(householdId) ?? new Set<HeadsUpType>()
    for (const type of types) known.add(type)
    wanting.set(householdId, known)
  }
  return wanting
}
