import { addDays } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { StorePrice } from "../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../database/scope.ts"
import { HISTORY_DAYS } from "./history.ts"

/**
 * How many days of prices stay: the ones read, and a day more, because a
 * household's own today can be a day off the server's.
 */
export const KEEP_PRICES_DAYS = HISTORY_DAYS + 1

/**
 * For the daily clean-up: clears prices older than any household reads.
 * Days are text ("2026-11-27"), so they compare in order. Returns how many
 * went.
 */
export async function clearOldPrices(
  em: EntityManager,
  now: Date = new Date()
): Promise<number> {
  const today = now.toISOString().slice(0, 10)
  return em.nativeDelete(
    StorePrice,
    { day: { $lt: addDays(today, -KEEP_PRICES_DAYS) } },
    ACROSS_HOUSEHOLDS
  )
}
