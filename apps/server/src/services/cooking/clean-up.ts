import type { EntityManager } from "@mikro-orm/sql"
import { CookingSession } from "../../database/entities/index.ts"

/** How long sessions are kept: they're what's happening now, not a history. */
export const KEEP_COOKING_SESSIONS_DAYS = 30

/**
 * For the daily clean-up: clears sessions that ended a month ago, and any
 * started that long ago, with their timers. Returns how many went.
 */
export async function clearOldCookingSessions(
  em: EntityManager
): Promise<number> {
  const before = new Date(
    Date.now() - KEEP_COOKING_SESSIONS_DAYS * 24 * 60 * 60 * 1000
  )
  // Their timers go with them, by the foreign key.
  return em.nativeDelete(
    CookingSession,
    { $or: [{ endedAt: { $lt: before } }, { startedAt: { $lt: before } }] },
    // Across households, and recipes in Recently deleted too.
    { filters: false }
  )
}
