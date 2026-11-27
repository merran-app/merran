import type { EntityManager } from "@mikro-orm/sql"
import { afterAll, beforeAll, expect, test } from "vitest"
import { SiteRecipe } from "../../../../database/entities/index.ts"
import type { Database } from "../../../../database/orm.ts"
import { createTestDatabase } from "../../../../test/database.ts"
import { shelfRows, type ShelfRow } from "./shelf-cache.ts"

let database: Database
let close: () => Promise<void>

const DAY = 24 * 60 * 60_000

/** A recipe on the shelf, posted this many days ago. */
function shelve(
  em: EntityManager,
  name: string,
  daysAgo: number,
  more: Partial<SiteRecipe> = {}
) {
  return em.create(SiteRecipe, {
    url: `https://shelf.example/${name.toLowerCase().replace(/\W+/g, "-")}/`,
    state: "recipe",
    siteName: "Shelf Example",
    name,
    courses: ["soup"],
    keywords: ["easy"],
    ingredients: ["1 onion"],
    diets: [],
    publishedAt: new Date(Date.now() - daysAgo * DAY),
    ...more,
  })
}

const names = (rows: readonly ShelfRow[]) => rows.map((row) => row.name)

/** The shelf, as a request with its own entity manager reads it. */
const shelf = () => shelfRows(database.em.fork())

beforeAll(async () => {
  ;({ database, close } = await createTestDatabase())
  const em = database.em.fork()
  shelve(em, "Pea Soup", 2)
  shelve(em, "Tomato Soup", 1)
  shelve(em, "Unopened Soup", 0, { state: "waiting" })
  await em.flush()
})

afterAll(() => close())

test("the shelf is read once and kept", async () => {
  const first = await shelf()
  // Only what's a recipe, newest first.
  expect(names(first)).toEqual(["Tomato Soup", "Pea Soup"])
  expect(await shelf()).toBe(first)
})

test("a change to a shelf row drops it", async () => {
  const em = database.em.fork()
  const kept = await shelf()

  const added = shelve(em, "Lentil Soup", 0)
  await em.flush()
  const afterAdding = await shelf()
  expect(afterAdding).not.toBe(kept)
  expect(names(afterAdding)).toEqual(["Lentil Soup", "Tomato Soup", "Pea Soup"])

  // An opened post, or a photo kept, is a change too.
  added.photo = "kept-photo"
  await em.flush()
  const afterChanging = await shelf()
  expect(afterChanging).not.toBe(afterAdding)
  expect(afterChanging[0]!.photo).toBe("kept-photo")

  await em.remove(added).flush()
  const afterRemoving = await shelf()
  expect(afterRemoving).not.toBe(afterChanging)
  expect(names(afterRemoving)).toEqual(["Tomato Soup", "Pea Soup"])
})

test("what's kept can't be changed by a caller", async () => {
  const rows = await shelf()
  expect(Object.isFrozen(rows)).toBe(true)
  expect(Object.isFrozen(rows[0])).toBe(true)
  expect(Object.isFrozen(rows[0]!.keywords)).toBe(true)
  expect(() => {
    ;(rows[0] as { name: string }).name = "Changed"
  }).toThrow(TypeError)
  expect(() => (rows[0]!.keywords as string[]).push("changed")).toThrow(
    TypeError
  )
})

test("each database keeps its own shelf", async () => {
  const kept = await shelf()
  const other = await createTestDatabase()
  try {
    const em = other.database.em.fork()
    shelve(em, "Other Soup", 0)
    await em.flush()

    expect(names(await shelfRows(other.database.em.fork()))).toEqual([
      "Other Soup",
    ])
    // The other database's change didn't drop this one's.
    expect(await shelf()).toBe(kept)
  } finally {
    await other.close()
  }
})

test("a read in a transaction isn't kept, and a change in one drops the shelf again as it commits", async () => {
  await shelf()
  let outside: Promise<readonly ShelfRow[]> | undefined

  await database.em.fork().transactional(async (tx) => {
    shelve(tx, "Transaction Soup", 0)
    await tx.flush()
    const inside = await shelfRows(tx)
    expect(names(inside)).toContain("Transaction Soup")
    expect(await shelfRows(tx)).not.toBe(inside)

    // A request reading the shelf before this commits: on Postgres it
    // reads on another connection and sees the shelf as it was, and on
    // SQLite it waits for the commit.
    outside = shelf()
  })
  await outside

  expect(names(await shelf())).toContain("Transaction Soup")
})

test("a change in a savepoint drops the shelf as the transaction around it commits", async () => {
  await shelf()
  let outside: Promise<readonly ShelfRow[]> | undefined

  await database.em.fork().transactional(async (tx) => {
    await tx.transactional(async (savepoint) => {
      shelve(savepoint, "Savepoint Soup", 0)
    })
    // Released, but not in the database for others until this commits.
    outside = shelf()
  })
  await outside

  expect(names(await shelf())).toContain("Savepoint Soup")
})
