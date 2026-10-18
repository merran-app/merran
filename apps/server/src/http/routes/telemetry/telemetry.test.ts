import { TelemetryReportSchema } from "@merran/shared/telemetry"
import { afterAll, beforeAll, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { Job } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { enqueue } from "../../../services/jobs/jobs.ts"
import type { JobRunner } from "../../../services/jobs/runner.ts"
import { testDatabaseKind } from "../../../test/database.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../test/app.ts"

let app: App
let close: () => Promise<void>
let database: Database
let jobs: JobRunner
const fetched: string[] = []
let kyle: TestClient
let jamie: TestClient

beforeAll(async () => {
  const test = await createTestApp({
    fetcher: async (url) => {
      fetched.push(url)
      throw new Error("Nothing should be fetched")
    },
  })
  ;({ app, close, database, jobs } = test)
  kyle = await setUpServer(app, test.setupCode)
  jamie = await join(app, await inviteToken(kyle), account("jamie", "Jamie"))
})

afterAll(() => close())

test("the next summary can be seen before saying yes to it", async () => {
  const res = await kyle.get("/api/telemetry/report")
  const report = await res.json()

  expect(res.status).toBe(200)
  expect(report).toEqual({
    installId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    version: expect.any(String),
    install: "source",
    arch: process.arch,
    database:
      testDatabaseKind === "sqlite"
        ? "sqlite"
        : expect.stringMatching(/^postgres \d+$/),
    // Tests have no yt-dlp or ffmpeg, so video import's off. Recipe sites
    // need nothing.
    modules: {
      ai: false,
      video: false,
      nutrition: false,
      sites: true,
      photos: false,
      voice: false,
      stores: false,
      errorTracking: false,
      telemetry: false,
      updates: true,
    },
    aiProviders: [],
    households: "1",
    people: "2-5",
    recipes: "0",
  })
  // Nothing about anyone.
  expect(JSON.stringify(report)).not.toMatch(/kyle|jamie|Home/i)
  // And just what the project's receiver takes.
  expect(TelemetryReportSchema.parse(report)).toEqual(report)
})

test("nothing's offered or sent until the project's receiver is live", async () => {
  expect(await (await kyle.get("/api/telemetry/status")).json()).toEqual({
    receiving: false,
    ask: false,
    last: null,
    totals: "https://merran.app/telemetry",
  })

  await kyle.patch("/api/settings/server", { "telemetry.enabled": true })
  const job = await enqueue(database.em.fork(), { kind: "telemetry.send" })
  await jobs.drain()
  const done = await database.em.fork().findOneOrFail(Job, { id: job.id })
  expect(done.result).toEqual({ sent: false })
  expect(fetched).toEqual([])
  await kyle.patch("/api/settings/server", { "telemetry.enabled": false })
})

test("the install id stays the same until a new one is made", async () => {
  const first = (await (await kyle.get("/api/telemetry/report")).json())
    .installId
  expect(
    (await (await kyle.get("/api/telemetry/report")).json()).installId
  ).toBe(first)

  const res = await kyle.post("/api/telemetry/install-id")
  expect(res.status).toBe(200)
  const next = (await res.json()).installId
  expect(next).not.toBe(first)
  expect(
    (await (await kyle.get("/api/telemetry/report")).json()).installId
  ).toBe(next)
})

test("only the server admin sees it", async () => {
  expect((await jamie.get("/api/telemetry/report")).status).toBe(403)
  expect((await jamie.post("/api/telemetry/install-id")).status).toBe(403)
  expect((await jamie.get("/api/telemetry/status")).status).toBe(403)
  expect(
    (await jamie.post("/api/telemetry/answer", { send: true })).status
  ).toBe(403)
  expect((await new TestClient(app).get("/api/telemetry/report")).status).toBe(
    401
  )
})
