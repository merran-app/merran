import type {
  Configuration,
  EventSubscriber,
  FlushEventArgs,
  TransactionEventArgs,
} from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import { outermostTransaction } from "../../../../database/at-commit.ts"
import { SiteRecipe } from "../../../../database/entities/index.ts"

// The shelf kept in memory. Every starter collection and every Discover
// round reads the whole shelf, up to about 1,400 recipes, so it's read once
// and kept until a shelf row changes: a site read, an opened post, a kept
// photo. Merran runs as one process (docs/platform.md), so what's kept here
// serves every request. Only the shelf is kept: whether a household has a
// recipe, and whether it suits it, is read each time.

/** What the shelf's readers use of each recipe on it. */
export type ShelfRow = Readonly<
  Pick<
    SiteRecipe,
    | "id"
    | "url"
    | "siteName"
    | "name"
    | "description"
    | "minutes"
    | "photoUrl"
    | "photo"
    | "publishedAt"
    | "createdAt"
  >
> & {
  readonly courses: readonly string[]
  readonly keywords: readonly string[]
  readonly ingredients: readonly string[]
  readonly diets: readonly string[]
}

const SHELF_FIELDS = [
  "id",
  "url",
  "siteName",
  "name",
  "description",
  "minutes",
  "photoUrl",
  "photo",
  "courses",
  "keywords",
  "ingredients",
  "diets",
  "publishedAt",
  "createdAt",
] as const

/**
 * Newest first. The id last, as it's made in time order, so recipes kept at
 * the same moment always come in the same order, and no page of a
 * collection repeats or skips one.
 */
const NEWEST_FIRST = {
  publishedAt: "desc",
  createdAt: "desc",
  id: "desc",
} as const

type Kept = {
  rows: readonly ShelfRow[] | null
  /** How many times it's been dropped, to tell a read that a change overtook. */
  drops: number
}

/**
 * Each database's shelf, by the ORM's configuration, which its entity
 * managers share: tests open several databases in one process.
 */
const kept = new WeakMap<Configuration, Kept>()

function keptFor(em: { config: Configuration }) {
  let found = kept.get(em.config)
  if (!found) {
    found = { rows: null, drops: 0 }
    kept.set(em.config, found)
  }
  return found
}

/** A recipe on the shelf as a plain object, frozen with its lists. */
function frozenRow(row: ShelfRow): ShelfRow {
  return Object.freeze({
    id: row.id,
    url: row.url,
    siteName: row.siteName,
    name: row.name,
    description: row.description,
    minutes: row.minutes,
    photoUrl: row.photoUrl,
    photo: row.photo,
    courses: Object.freeze([...row.courses]),
    keywords: Object.freeze([...row.keywords]),
    ingredients: Object.freeze([...row.ingredients]),
    diets: Object.freeze([...row.diets]),
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
  })
}

/** Every recipe on the shelf, newest first, read from the database. */
async function readShelf(em: EntityManager): Promise<readonly ShelfRow[]> {
  const rows = await em.find(
    SiteRecipe,
    { state: "recipe" },
    {
      fields: SHELF_FIELDS,
      orderBy: NEWEST_FIRST,
      // Not left in the entity manager with only these fields loaded: what
      // loads a shelf recipe after this gets all of it.
      disableIdentityMap: true,
    }
  )
  return Object.freeze(rows.map(frozenRow))
}

/**
 * Every recipe on the shelf, newest first: read once and kept until a
 * shelf row changes. Every caller gets the same objects, so they're
 * frozen: a caller that changed one would change everyone's, and fails
 * instead.
 */
export async function shelfRows(
  em: EntityManager
): Promise<readonly ShelfRow[]> {
  // Read, not kept, in a transaction: it can see what the transaction has
  // changed, which may yet be rolled back.
  if (em.isInTransaction()) return readShelf(em)

  const shelf = keptFor(em)
  if (shelf.rows) return shelf.rows
  const drops = shelf.drops
  const rows = await readShelf(em)
  // Not kept when the shelf was dropped while it was read: what was read
  // may be from before the change.
  if (shelf.drops === drops) shelf.rows = rows
  return rows
}

/** Forgets a database's shelf, so the next to ask reads it again. */
export function dropShelf(em: { config: Configuration }) {
  const shelf = keptFor(em)
  shelf.rows = null
  shelf.drops += 1
}

/** Transactions that changed a shelf row, to drop the shelf as they commit. */
const changedIn = new WeakSet<object>()

/**
 * Drops the shelf when a shelf row is created, changed or removed: when
 * the flush is done, and again when the transaction it was part of
 * commits. Until then, a request on another connection (Postgres has a
 * few) still reads the shelf as it was, and would keep it. Every database
 * has it (orm.ts).
 */
export class ShelfChanges implements EventSubscriber {
  afterFlush({ em, uow }: FlushEventArgs) {
    const changed = uow
      .getChangeSets()
      .some((change) => change.meta.className === SiteRecipe.meta.className)
    if (!changed) return

    dropShelf(em)
    // A flush outside a transaction has committed by now.
    const transaction = em.getTransactionContext()
    if (transaction) changedIn.add(outermostTransaction(transaction))
  }

  afterTransactionCommit({ em, transaction }: TransactionEventArgs) {
    if (!transaction || !changedIn.has(transaction)) return
    changedIn.delete(transaction)
    dropShelf(em)
  }
}
