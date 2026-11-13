import { LockMode } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import {
  CookingSession,
  CookingTimer,
  Job,
} from "../../database/entities/index.ts"
import { inHouseholdTransaction } from "../../database/transactions.ts"
import { createJob, wakeRunner } from "../jobs/jobs.ts"
import type { JobHandler } from "../jobs/runner.ts"
import { MERRAN } from "../webhooks/actor.ts"
import type { TimerRef } from "../webhooks/payloads.ts"
import { recordTimerEvent, timerRef } from "./events.ts"
import {
  endIfIdle,
  lockOwnSession,
  sessionNotFound,
  WITH_DELETED_RECIPES,
} from "./sessions.ts"

// Kitchen timers from cook view. The server keeps its own copy of each, with
// a job at its end, so `timer.finished` goes out on time even when the
// device that started it sleeps (docs/webhooks.md).

/** The job that sends a timer's `timer.finished` when its time is up. */
export const TIMER_DONE_JOB = "cooking.timerDone"

/** A bound on what one session can make the server keep. */
const MOST_RUNNING_TIMERS = 20

/** Keyed by the server's own id for the timer, since cook view picks its id. */
const timerJobKey = (timerRowId: string) => `cooking.timer:${timerRowId}`

function timerNotFound() {
  return new AppError(
    "not_found",
    "cooking_timer_not_found",
    "There's no such timer in this cooking session."
  )
}

/**
 * Starts a timer, or gives one more time: `seconds` is how many are left.
 * A new one needs the session to be open; one it has can be changed after
 * it ends, since timers keep ringing in the app after cook view is left.
 */
export function setTimer(
  em: EntityManager,
  householdId: string,
  cookId: string,
  sessionId: string,
  timerId: string,
  input: { label: string; seconds: number }
): Promise<TimerRef> {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const session = await lockOwnSession(tx, cookId, sessionId)
    const endsAt = new Date(Date.now() + input.seconds * 1000)
    const timer = await tx.findOne(CookingTimer, {
      session: session.id,
      timerId,
    })

    if (!timer) {
      await startTimer(tx, householdId, session, {
        timerId,
        label: input.label,
        seconds: input.seconds,
        endsAt,
      })
    } else {
      await extendTimer(tx, householdId, session, timer, endsAt)
    }

    const saved = await tx.findOneOrFail(CookingTimer, {
      session: session.id,
      timerId,
    })
    return timerRef(saved)
  })
}

async function startTimer(
  em: EntityManager,
  householdId: string,
  session: CookingSession,
  input: { timerId: string; label: string; seconds: number; endsAt: Date }
): Promise<void> {
  // Only an open session starts new timers.
  if (session.endedAt) throw sessionNotFound()

  const running = await em.count(CookingTimer, {
    session: session.id,
    state: "running",
  })
  if (running >= MOST_RUNNING_TIMERS) {
    throw new AppError(
      "conflict",
      "too_many_timers",
      `A cooking session can have ${MOST_RUNNING_TIMERS} timers running at once.`
    )
  }

  const timer = em.create(CookingTimer, {
    household: householdId,
    session,
    timerId: input.timerId,
    label: input.label,
    seconds: input.seconds,
    endsAt: input.endsAt,
  })
  await em.flush()
  await queueTimerJob(em, householdId, timer)
  await recordTimerEvent(em, householdId, "timer.started", session, timer)
}

/**
 * More time: it now ends at `endsAt`, and its length grows by however far
 * that moved its end. One that's gone off or been cancelled runs again.
 */
async function extendTimer(
  em: EntityManager,
  householdId: string,
  session: CookingSession,
  timer: CookingTimer,
  endsAt: Date
): Promise<void> {
  const running = timer.state === "running"
  const from = running ? timer.endsAt.getTime() : Date.now()
  const added = Math.round((endsAt.getTime() - from) / 1000)
  timer.seconds = Math.max(1, timer.seconds + added)
  timer.endsAt = endsAt
  timer.state = "running"
  await em.flush()
  await queueTimerJob(em, householdId, timer)
  await recordTimerEvent(em, householdId, "timer.extended", session, timer)
}

/**
 * Cancels a running timer before it goes off. One that's gone off or been
 * cancelled already changes nothing: dismissing it isn't news. A session
 * that was left ends once its last running timer is cancelled.
 */
export function cancelTimer(
  em: EntityManager,
  householdId: string,
  cookId: string,
  sessionId: string,
  timerId: string
): Promise<void> {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const session = await lockOwnSession(tx, cookId, sessionId)
    const timer = await tx.findOne(CookingTimer, {
      session: session.id,
      timerId,
    })
    if (!timer) throw timerNotFound()
    if (timer.state !== "running") return

    timer.state = "cancelled"
    await tx.flush()
    await cancelTimerJob(tx, timer)
    await recordTimerEvent(tx, householdId, "timer.cancelled", session, timer)
    if (session.leftAt && !session.endedAt) {
      await endIfIdle(tx, householdId, session)
      await tx.flush()
    }
  })
}

/** Puts the timer's job at its end: moving one that's waiting, or a new one. */
async function queueTimerJob(
  em: EntityManager,
  householdId: string,
  timer: CookingTimer
): Promise<void> {
  const key = timerJobKey(timer.id)
  const waiting = await em.findOne(Job, { key, status: "queued" })
  if (waiting) {
    waiting.runAt = timer.endsAt
    await em.flush()
    return
  }
  // None waiting, or one running now that will find the time isn't up.
  createJob(em, {
    kind: TIMER_DONE_JOB,
    key,
    householdId,
    payload: { timerId: timer.id },
    runAt: timer.endsAt,
  })
  await em.flush()
  wakeRunner()
}

async function cancelTimerJob(em: EntityManager, timer: CookingTimer) {
  await em.nativeUpdate(
    Job,
    { key: timerJobKey(timer.id), status: "queued" },
    { status: "cancelled", finishedAt: new Date() }
  )
}

/**
 * A timer's time is up: it's finished, `timer.finished` goes out as
 * Merran's own, and a session that was left ends if it was the last one
 * running. A timer given more time since does nothing: its moved job will.
 */
export const timerDoneJob: JobHandler = {
  kind: TIMER_DONE_JOB,
  async run({ em, payload, householdId }) {
    const timerRowId = String(payload.timerId)
    if (!householdId) {
      throw new Error("A cooking timer goes off in its household.")
    }
    return inHouseholdTransaction(em, householdId, async (tx) => {
      const found = await tx.findOne(CookingTimer, { id: timerRowId })
      if (!found) return { finished: false }

      // The session is held first, as the routes hold it, then the timer
      // read again, so a cancel and this can't each wait on the other.
      const session = await tx.findOneOrFail(
        CookingSession,
        { id: found.session.id },
        { lockMode: LockMode.PESSIMISTIC_WRITE, ...WITH_DELETED_RECIPES }
      )
      const timer = await tx.findOneOrFail(
        CookingTimer,
        { id: timerRowId },
        { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true }
      )
      if (timer.state !== "running") return { finished: false }
      if (timer.endsAt.getTime() > Date.now()) return { finished: false }

      timer.state = "finished"
      await tx.flush()
      await recordTimerEvent(
        tx,
        householdId,
        "timer.finished",
        session,
        timer,
        MERRAN
      )
      if (session.leftAt && !session.endedAt) {
        await endIfIdle(tx, householdId, session, MERRAN)
        await tx.flush()
      }
      return { finished: true }
    })
  },
}
