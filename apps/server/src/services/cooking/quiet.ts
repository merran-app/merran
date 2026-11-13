import { LockMode } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import { CookingSession, CookingTimer } from "../../database/entities/index.ts"
import { inHouseholdTransaction } from "../../database/transactions.ts"
import type { JobHandler } from "../jobs/runner.ts"
import { MERRAN } from "../webhooks/actor.ts"
import {
  END_QUIET_JOB,
  longestEnd,
  queueQuietCheck,
  quietEnd,
} from "./quiet-check.ts"
import { endSession, WITH_DELETED_RECIPES } from "./sessions.ts"

// Sessions end on their own, so the hood fan doesn't stay on all night:
// cook view gone quiet with no timer running, or cooking going on for 12
// hours, whatever's running (docs/webhooks.md). Each session's own quiet
// check does this (quiet-check.ts).

/**
 * Looks at one session when its quiet check comes round: ends it, as
 * Merran, when it's been open 12 hours or quiet for 30 minutes with no
 * timer running; ends a left one whose timers are done; and otherwise
 * looks again when it next could end.
 */
export const endQuietSessionJob: JobHandler = {
  kind: END_QUIET_JOB,
  async run({ em, payload, householdId }) {
    const sessionId = String(payload.sessionId)
    if (!householdId) {
      throw new Error("A cooking session is checked in its household.")
    }
    return inHouseholdTransaction(em, householdId, (tx) =>
      checkQuiet(tx, householdId, sessionId)
    )
  },
}

async function checkQuiet(
  em: EntityManager,
  householdId: string,
  sessionId: string
): Promise<{ ended: boolean }> {
  const session = await em.findOne(
    CookingSession,
    { id: sessionId, endedAt: null },
    { lockMode: LockMode.PESSIMISTIC_WRITE, ...WITH_DELETED_RECIPES }
  )
  if (!session) return { ended: false }

  const now = new Date()
  if (longestEnd(session) <= now) {
    await endSession(em, householdId, session, "timed_out", MERRAN)
    return { ended: true }
  }

  const lastTimer = await em.findOne(
    CookingTimer,
    { session: session.id, state: "running" },
    { orderBy: { endsAt: "desc" } }
  )
  if (session.leftAt && !lastTimer) {
    await endSession(em, householdId, session, "stopped", MERRAN)
    return { ended: true }
  }

  // Heard from since this check was put here: look when it next goes quiet.
  if (quietEnd(session) > now) {
    await queueQuietCheck(em, householdId, session)
    return { ended: false }
  }

  // Quiet, but something's on the stove: look again when it's done.
  if (lastTimer) {
    await queueQuietCheck(em, householdId, session, lastTimer.endsAt)
    return { ended: false }
  }

  await endSession(em, householdId, session, "timed_out", MERRAN)
  return { ended: true }
}
