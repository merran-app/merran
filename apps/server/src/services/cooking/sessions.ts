import { LockMode } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import type { CookingOutcome } from "@merran/shared"
import { AppError } from "../../core/errors.ts"
import {
  CookingSession,
  CookingTimer,
  Job,
  PlanEntry,
} from "../../database/entities/index.ts"
import { toNumber } from "../../database/numbers.ts"
import { NOT_DELETED_FILTER } from "../../database/scope.ts"
import { inHouseholdTransaction } from "../../database/transactions.ts"
import { createJob, wakeRunner } from "../jobs/jobs.ts"
import type { JobHandler } from "../jobs/runner.ts"
import { findEntry } from "../plan/plan.ts"
import { findRecipe } from "../recipes/recipes.ts"
import { MERRAN, type Actor } from "../webhooks/actor.ts"
import { mealRef } from "../webhooks/events/plan.ts"
import type { MealRef, RecipeRef, TimerRef } from "../webhooks/payloads.ts"
import {
  cookingContext,
  pairedRecipe,
  recordCookingEnded,
  recordCookingStarted,
  timerRef,
} from "./events.ts"

// Cooking sessions: someone cooking a recipe in cook view, on one device.
// Cook view says when cooking starts, checks in while it's open, and says
// when it's left or its page goes away; Made it ends a session too
// (docs/webhooks.md, "Cooking sessions and timers").

/** The job that ends a session a minute after cook view's page went away. */
export const CLOSE_SESSION_JOB = "cooking.closeSession"

/** How long a closed page has to come back, as a reload does. */
const CLOSE_AFTER_MS = 60_000

const closeJobKey = (sessionId: string) => `cooking.close:${sessionId}`

/**
 * Cooking goes on when its recipe is moved to Recently deleted mid-cook,
 * and the database would otherwise leave such a session out, following
 * the recipe's filter through the session's `recipe`.
 */
export const WITH_DELETED_RECIPES = {
  filters: { [NOT_DELETED_FILTER]: false },
} as const

/** A session as the API shows it. */
export type SessionView = {
  id: string
  cook: { id: string; name: string } | null
  recipe: RecipeRef
  with: RecipeRef | null
  meal: MealRef | null
  servings: number | null
  startedAt: string
  heardAt: string
  leaving: boolean
  endedAt: string | null
  outcome: CookingOutcome | null
  timers: TimerRef[]
}

export type NewSession = {
  /** The recipe's id or slug. */
  recipe: string
  /** The recipe cooked with it, as a pairing. */
  with?: string | null
  /** The planned meal it's cooked for. */
  meal?: string | null
  servings?: number | null
}

export function sessionNotFound() {
  return new AppError(
    "not_found",
    "cooking_session_not_found",
    "There's no such cooking session, or it's ended."
  )
}

/** Starts cooking, and tells webhooks. */
export function startSession(
  em: EntityManager,
  householdId: string,
  cookId: string,
  input: NewSession
): Promise<SessionView> {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const recipe = await findRecipe(tx, input.recipe)
    const paired = input.with ? await findRecipe(tx, input.with) : null
    const entry = input.meal ? await findEntry(tx, input.meal) : null
    const session = tx.create(CookingSession, {
      household: householdId,
      cook: cookId,
      recipe,
      paired,
      entry,
      servings: input.servings ?? null,
      heardAt: new Date(),
    })
    await tx.flush()

    const view = await describeSession(tx, session)
    await recordCookingStarted(tx, householdId, session, view.meal)
    return view
  })
}

/**
 * Cook view is still cooking: its last word is now, and a close or a
 * leaving that was coming is called off. Servings change if it sends them.
 */
export function checkIn(
  em: EntityManager,
  householdId: string,
  cookId: string,
  sessionId: string,
  changes: { servings?: number | null }
): Promise<SessionView> {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const session = await lockOpenSession(tx, cookId, sessionId)
    session.heardAt = new Date()
    session.leftAt = null
    if (session.closingAt) {
      session.closingAt = null
      await cancelCloseJob(tx, session.id)
    }
    if (changes.servings !== undefined) session.servings = changes.servings
    await tx.flush()
    return describeSession(tx, session)
  })
}

/**
 * Cook view was left: cooking ends now, or once its running timers are
 * done. `soon` is for a page that went away, which may be a reload: it
 * ends a minute later, unless cook view checks in first.
 */
export function leaveSession(
  em: EntityManager,
  householdId: string,
  cookId: string,
  sessionId: string,
  options: { soon: boolean }
): Promise<SessionView> {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const session = await lockOpenSession(tx, cookId, sessionId)
    if (options.soon) {
      session.closingAt = new Date(Date.now() + CLOSE_AFTER_MS)
      await queueCloseJob(tx, householdId, session)
    } else {
      if (session.closingAt) {
        session.closingAt = null
        await cancelCloseJob(tx, session.id)
      }
      await endIfIdle(tx, householdId, session)
    }
    await tx.flush()
    return describeSession(tx, session)
  })
}

/**
 * Ends a session that was left, unless a timer is still running: then it
 * ends when the last one is done or cancelled.
 */
export async function endIfIdle(
  em: EntityManager,
  householdId: string,
  session: CookingSession,
  actor?: Actor
): Promise<void> {
  const running = await em.count(CookingTimer, {
    session: session.id,
    state: "running",
  })
  if (running === 0) {
    await endSession(em, householdId, session, "stopped", actor)
    return
  }
  session.leftAt ??= new Date()
}

/** Ends a session, and tells webhooks how it ended. */
export async function endSession(
  em: EntityManager,
  householdId: string,
  session: CookingSession,
  outcome: CookingOutcome,
  actor?: Actor
): Promise<void> {
  session.endedAt = new Date()
  session.outcome = outcome
  if (session.closingAt) {
    session.closingAt = null
    await cancelCloseJob(em, session.id)
  }
  await em.flush()
  await recordCookingEnded(em, householdId, session, actor)
}

/** Who's cooking now, earliest first. */
export async function openSessions(em: EntityManager): Promise<SessionView[]> {
  const sessions = await em.find(
    CookingSession,
    { endedAt: null },
    { orderBy: { startedAt: "asc", id: "asc" }, ...WITH_DELETED_RECIPES }
  )
  const views: SessionView[] = []
  for (const session of sessions) views.push(await describeSession(em, session))
  return views
}

/** A session as the API shows it, with its running timers. */
export async function describeSession(
  em: EntityManager,
  session: CookingSession
): Promise<SessionView> {
  const context = await cookingContext(em, session)
  const timers = await em.find(
    CookingTimer,
    { session: session.id, state: "running" },
    { orderBy: { endsAt: "asc" } }
  )
  return {
    id: session.id,
    cook: context.cook,
    recipe: context.recipe,
    with: await pairedRecipe(em, session),
    meal: await plannedMeal(em, session),
    servings: toNumber(session.servings),
    startedAt: session.startedAt.toISOString(),
    heardAt: session.heardAt.toISOString(),
    leaving: Boolean(session.leftAt || session.closingAt),
    endedAt: session.endedAt?.toISOString() ?? null,
    outcome: session.outcome ?? null,
    timers: timers.map(timerRef),
  }
}

/** The planned meal it's cooked for, unless it's since come off the plan. */
async function plannedMeal(
  em: EntityManager,
  session: CookingSession
): Promise<MealRef | null> {
  if (!session.entry) return null
  const entry = await em.findOne(PlanEntry, { id: session.entry.id })
  return entry ? mealRef(em, entry) : null
}

/**
 * The cook's own session, while it's open, held until the transaction ends
 * so a close and a check-in can't cross. Anyone else's is not found.
 */
export async function lockOpenSession(
  em: EntityManager,
  cookId: string,
  sessionId: string
): Promise<CookingSession> {
  const session = await em.findOne(
    CookingSession,
    { id: sessionId, cook: cookId, endedAt: null },
    { lockMode: LockMode.PESSIMISTIC_WRITE, ...WITH_DELETED_RECIPES }
  )
  if (!session) throw sessionNotFound()
  return session
}

/** The cook's own session, open or ended, held like `lockOpenSession`. */
export async function lockOwnSession(
  em: EntityManager,
  cookId: string,
  sessionId: string
): Promise<CookingSession> {
  const session = await em.findOne(
    CookingSession,
    { id: sessionId, cook: cookId },
    { lockMode: LockMode.PESSIMISTIC_WRITE, ...WITH_DELETED_RECIPES }
  )
  if (!session) throw sessionNotFound()
  return session
}

async function queueCloseJob(
  em: EntityManager,
  householdId: string,
  session: CookingSession
): Promise<void> {
  const runAt = session.closingAt ?? new Date()
  const key = closeJobKey(session.id)
  // A close already waiting is moved to the new minute. One running now
  // will find the minute isn't up, so this one gets a job of its own.
  const waiting = await em.findOne(Job, { key, status: "queued" })
  if (waiting) {
    waiting.runAt = runAt
    return
  }
  createJob(em, {
    kind: CLOSE_SESSION_JOB,
    key,
    householdId,
    payload: { sessionId: session.id },
    runAt,
  })
  await em.flush()
  wakeRunner()
}

async function cancelCloseJob(em: EntityManager, sessionId: string) {
  await em.nativeUpdate(
    Job,
    { key: closeJobKey(sessionId), status: "queued" },
    { status: "cancelled", finishedAt: new Date() }
  )
}

/**
 * Ends a session whose page went away a minute ago and didn't come back:
 * now, or once its running timers are done.
 */
export const closeSessionJob: JobHandler = {
  kind: CLOSE_SESSION_JOB,
  async run({ em, payload, householdId }) {
    const sessionId = String(payload.sessionId)
    if (!householdId) {
      throw new Error("A cooking session is closed in its household.")
    }
    return inHouseholdTransaction(em, householdId, async (tx) => {
      const session = await tx.findOne(
        CookingSession,
        { id: sessionId, endedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE, ...WITH_DELETED_RECIPES }
      )
      if (!session?.closingAt || session.closingAt > new Date()) {
        return { closed: false }
      }
      session.closingAt = null
      await endIfIdle(tx, householdId, session, MERRAN)
      await tx.flush()
      return { closed: true }
    })
  },
}
