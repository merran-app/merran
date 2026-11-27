import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, expect, test, vi } from "vitest"
import type { Database } from "../../database/orm.ts"
import { createTestDatabase, testDatabaseKind } from "../../test/database.ts"
import { cleanUpJobsJob } from "./clean-up.ts"
import type { JobContext } from "./runner.ts"

let database: Database
let close: () => Promise<void>
let dataDir: string

beforeAll(async () => {
  ;({ database, close } = await createTestDatabase())
  dataDir = await mkdtemp(join(tmpdir(), "merran-clean-up-"))
})

afterAll(async () => {
  await close()
  await rm(dataDir, { recursive: true, force: true })
})

test("the daily clean-up reports what it cleared of prices, sign-ins and suggestions", async () => {
  const context = {
    em: database.em.fork(),
    deps: { config: { dataDir } },
  } as unknown as JobContext

  const result = await cleanUpJobsJob.run(context)

  expect(result).toMatchObject({
    prices: 0,
    signIns: { sessions: 0, verifications: 0, tokens: 0, rateLimits: 0 },
    proposals: 0,
  })
})

test("refreshes SQLite's statistics last, so it can't stop the clearing out", async () => {
  const em = database.em.fork()
  const execute = vi.spyOn(em.getConnection(), "execute")
  try {
    await cleanUpJobsJob.run({
      em,
      deps: { config: { dataDir } },
    } as unknown as JobContext)
    const queries = execute.mock.calls.map(([query]) => String(query))
    const optimize = queries.filter((query) => query === "pragma optimize")
    if (testDatabaseKind === "sqlite") {
      expect(optimize).toHaveLength(1)
      expect(queries.at(-1)).toBe("pragma optimize")
    } else {
      expect(optimize).toEqual([])
    }
  } finally {
    execute.mockRestore()
  }
})
