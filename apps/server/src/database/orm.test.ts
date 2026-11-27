import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { openDatabase } from "./orm.ts"

/** One pragma's value, read back from the open connection. */
async function pragma(
  database: Awaited<ReturnType<typeof openDatabase>>,
  name: string
) {
  const [row] = await database.em
    .getConnection()
    .execute<Record<string, unknown>[]>(`pragma ${name}`)
  return Object.values(row ?? {})[0]
}

test("SQLite's settings are applied when it opens", async () => {
  // In memory there's no write-ahead log, so this one is a file.
  const folder = await mkdtemp(join(tmpdir(), "merran-orm-"))
  const database = await openDatabase({
    kind: "sqlite",
    file: join(folder, "merran.db"),
  })

  try {
    expect(await pragma(database, "journal_mode")).toBe("wal")
    expect(await pragma(database, "synchronous")).toBe(1)
    expect(await pragma(database, "temp_store")).toBe(2)
    expect(await pragma(database, "busy_timeout")).toBe(5000)
    expect(await pragma(database, "cache_size")).toBe(-65536)
  } finally {
    // SQLite holds the file until it's closed, and Windows won't remove it
    // from under it.
    await database.close()
    await rm(folder, { recursive: true, force: true })
  }
})
