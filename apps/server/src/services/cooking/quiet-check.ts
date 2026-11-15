import type { EntityManager } from "@mikro-orm/sql"
import type { CookingSession } from "../../database/entities/index.ts"
import { cancelKeyedJob, putKeyedJob } from "./keyed-jobs.ts"

// Each open session has one quiet check waiting: 30 minutes after cook
// view's last word, or at its 12 hours. Checking in moves it, so only a
// session cook view has gone quiet on is looked at, and a server nobody
// cooks on runs nothing (docs/webhooks.md).

/** The job that ends a session cook view went quiet on. */
export const END_QUIET_JOB = "cooking.endQuiet"

/** How long cook view can say nothing, with no timer running. */
export const QUIET_MINUTES = 30

/** The longest a session stays open, timers or not. */
export const LONGEST_HOURS = 12

const quietJobKey = (sessionId: string) => `cooking.quiet:${sessionId}`

/** When a session's 12 hours are up. */
export function longestEnd(session: CookingSession): Date {
  return new Date(session.startedAt.getTime() + LONGEST_HOURS * 3_600_000)
}

/** When a session will have been quiet long enough, if nothing's heard. */
export function quietEnd(session: CookingSession): Date {
  return new Date(session.heardAt.getTime() + QUIET_MINUTES * 60_000)
}

/**
 * Puts the session's quiet check at `at`, or when it goes quiet, but
 * never after its 12 hours are up.
 */
export async function queueQuietCheck(
  em: EntityManager,
  householdId: string,
  session: CookingSession,
  at: Date = quietEnd(session)
): Promise<void> {
  const cap = longestEnd(session)
  await putKeyedJob(em, {
    kind: END_QUIET_JOB,
    key: quietJobKey(session.id),
    householdId,
    payload: { sessionId: session.id },
    runAt: at < cap ? at : cap,
  })
}

export function cancelQuietCheck(em: EntityManager, sessionId: string) {
  return cancelKeyedJob(em, quietJobKey(sessionId))
}
