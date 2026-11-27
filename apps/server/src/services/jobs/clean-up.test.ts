import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, expect, test } from "vitest"
import type { Database } from "../../database/orm.ts"
import { createTestDatabase } from "../../test/database.ts"
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
