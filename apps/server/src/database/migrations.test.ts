import { readFileSync } from "node:fs"
import { afterAll, beforeAll, expect, test } from "vitest"
import { createTestDatabase, testDatabaseKind } from "../test/database.ts"
import type { Database } from "./orm.ts"

type Snapshot = {
  tables: {
    name: string
    indexes: { columnNames: string[] }[]
    foreignKeys: Record<string, { columnNames: string[] }>
  }[]
}

let database: Database
let close: () => Promise<void>

beforeAll(async () => {
  ;({ database, close } = await createTestDatabase())
})

afterAll(() => close())

test(`the ${testDatabaseKind} migrations build exactly what the entities describe`, async () => {
  // If this fails, an entity changed without a migration: run `pnpm db:migration`.
  const missing = await database.schema.getUpdateSchemaSQL({ wrap: false })

  expect(missing.trim()).toBe("")
})

test("every foreign key has an index on Postgres", () => {
  // Postgres doesn't index a foreign key by itself, as SQLite's migrations
  // do: without one, finding a household's rows, or deleting what they
  // point at, reads the whole table. Declare it with `.index()`.
  const snapshot = JSON.parse(
    readFileSync(
      new URL("./migrations/postgres/.snapshot.json", import.meta.url),
      "utf8"
    )
  ) as Snapshot
  const unindexed = snapshot.tables.flatMap((table) =>
    Object.values(table.foreignKeys)
      .filter(
        (key) =>
          !table.indexes.some((index) =>
            key.columnNames.every(
              (column, position) => index.columnNames[position] === column
            )
          )
      )
      .map((key) => `${table.name}(${key.columnNames.join(", ")})`)
  )

  expect(unindexed).toEqual([])
})
