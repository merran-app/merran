import type { EventSubscriber, TransactionEventArgs } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"

// Work a transaction does as it commits rather than when a change asks for
// it: the last thing before the commit, still part of the transaction. A
// row written part way through a transaction stays locked while the
// transaction goes on to lock others, which can deadlock with one that
// locked those first. Written last, it's held only for the commit. The
// webhooks' merge jobs are written this way (docs/webhooks.md, "Gathering").

/** Work to do as a transaction commits, with the transaction's entity manager. */
export type CommitWork = (tx: EntityManager) => Promise<void>

/** The work each transaction or savepoint is to do as it commits, by key. */
const waiting = new WeakMap<object, Map<string, CommitWork>>()

/** The transaction each savepoint was made in. */
const outerOf = new WeakMap<object, object>()

/**
 * The transaction a savepoint is being made in, by the entity manager
 * making it, between the events before and after it's made.
 */
const making = new WeakMap<object, object>()

/**
 * Has the transaction `em` is in do `work` just before it commits. Work
 * given a key already given in that transaction is left out, so it runs
 * once, and the work runs in the order of its keys, so two transactions
 * take the rows they write in the same order. Entities it creates are
 * saved after the last of it. Work given in a savepoint passes to the
 * transaction around it when the savepoint is released, and is dropped if
 * it's rolled back.
 *
 * Returns false outside a transaction, and does nothing: the caller does
 * the work itself, now.
 */
export function atCommit(
  em: EntityManager,
  key: string,
  work: CommitWork
): boolean {
  const transaction: object | undefined = em.getTransactionContext()
  if (!transaction) return false

  let works = waiting.get(transaction)
  if (!works) {
    works = new Map()
    waiting.set(transaction, works)
  }
  if (!works.has(key)) works.set(key, work)
  return true
}

/**
 * Runs the work given to `atCommit` as each transaction commits. Every
 * database has it (orm.ts).
 */
export class AtCommit implements EventSubscriber {
  beforeTransactionStart({ em, transaction }: TransactionEventArgs) {
    // Started within a transaction, it's a savepoint.
    if (transaction) {
      making.set(em, transaction)
    } else {
      making.delete(em)
    }
  }

  afterTransactionStart({ em, transaction }: TransactionEventArgs) {
    const outer = making.get(em)
    making.delete(em)
    if (outer && transaction) outerOf.set(transaction, outer)
  }

  async beforeTransactionCommit({ em, transaction }: TransactionEventArgs) {
    if (!transaction) return
    const works = waiting.get(transaction)
    if (!works) return
    waiting.delete(transaction)

    const outer = outerOf.get(transaction)
    if (outer) {
      passToOuter(works, outer)
      return
    }

    // Its own fork, so the work's flush saves only what the work made.
    const tx = em.fork({ keepTransactionContext: true }) as EntityManager
    const keys = [...works.keys()].sort()
    for (const key of keys) {
      await works.get(key)!(tx)
    }
    await tx.flush()
  }
}

/** A released savepoint's work, now the transaction around it's to do. */
function passToOuter(works: Map<string, CommitWork>, outer: object) {
  let outerWorks = waiting.get(outer)
  if (!outerWorks) {
    outerWorks = new Map()
    waiting.set(outer, outerWorks)
  }
  for (const [key, work] of works) {
    if (!outerWorks.has(key)) outerWorks.set(key, work)
  }
}
