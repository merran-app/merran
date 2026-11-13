import { LockMode } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import { CookingSession, CookingTimer } from "../../database/entities/index.ts"
import { inHouseholdTransaction } from "../../database/transactions.ts"
import type { JobHandler } from "../jobs/runner.ts"
import { MERRAN } from "../webhooks/actor.ts"
import { endSession, WITH_DELETED_RECIPES } from "./sessions.ts"

// Sessions end on their own, so the hood fan doesn't stay on all night:
// cook view gone quiet with no timer running, or cooking going on for 12
// hours, whatever's running (docs/webhooks.md).

/** The sweep, every 5 minutes, that ends sessions nobody's cooking in. */
export const END_QUIET_JOB = "cooking.endQuiet"

/** How long cook view can say nothing, with no timer running. */
export const QUIET_MINUTES = 30

/** The longest a session stays open, timers or not. */
export const LONGEST_HOURS = 12

/**
 * Ends, as Merran, each open session gone quiet with no timer running, or
 * started 12 hours ago, as `timed_out`; and each left session whose timers
 * are all done, as `stopped`, in case its last timer's job didn't.
 */
export const endQuietSessionsJob: JobHandler = {
  kind: END_QUIET_JOB,
  concurrency: 1,
  async run({ em }) {
    const now = Date.now()
    const quietSince = new Date(now - QUIET_MINUTES * 60_000)
    const startedBefore = new Date(now - LONGEST_HOURS * 3_600_000)
    const candidates = await em.find(
      CookingSession,
      {
        endedAt: null,
        $or: [
          { heardAt: { $lt: quietSince } },
          { startedAt: { $lt: startedBefore } },
          { leftAt: { $ne: null } },
        ],
      },
      // Across households, and recipes in Recently deleted too.
      { filters: false }
    )

    let ended = 0
    for (const candidate of candidates) {
      const householdId = candidate.household.id
      const didEnd = await inHouseholdTransaction(em, householdId, (tx) =>
        endIfDue(tx, householdId, candidate.id, { quietSince, startedBefore })
      )
      if (didEnd) ended++
    }
    return { ended }
  },
}

/** Ends one session if it's still due to end, once it's held. */
async function endIfDue(
  em: EntityManager,
  householdId: string,
  sessionId: string,
  limits: { quietSince: Date; startedBefore: Date }
): Promise<boolean> {
  const session = await em.findOne(
    CookingSession,
    { id: sessionId, endedAt: null },
    { lockMode: LockMode.PESSIMISTIC_WRITE, ...WITH_DELETED_RECIPES }
  )
  if (!session) return false

  if (session.startedAt < limits.startedBefore) {
    await endSession(em, householdId, session, "timed_out", MERRAN)
    return true
  }

  const running = await em.count(CookingTimer, {
    session: session.id,
    state: "running",
  })
  if (running > 0) return false

  if (session.leftAt) {
    await endSession(em, householdId, session, "stopped", MERRAN)
    return true
  }
  if (session.heardAt < limits.quietSince) {
    await endSession(em, householdId, session, "timed_out", MERRAN)
    return true
  }
  return false
}
