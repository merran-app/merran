import type { EntityManager } from "@mikro-orm/sql"
import { HOUSEHOLD_FILTER } from "./scope.ts"

/**
 * Runs `work` in a transaction that sees only one household's rows. It
 * starts from a fresh fork, so what it loads isn't shared with whatever
 * the caller already loaded.
 */
export function inHouseholdTransaction<T>(
  em: EntityManager,
  householdId: string,
  work: (tx: EntityManager) => Promise<T>
): Promise<T> {
  return em.fork({ keepTransactionContext: true }).transactional((tx) => {
    tx.setFilterParams(HOUSEHOLD_FILTER, { householdId })
    return work(tx)
  })
}
