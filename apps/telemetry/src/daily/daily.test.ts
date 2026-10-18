import { randomUUID } from "node:crypto"
import type { TelemetryReport } from "@merran/shared/telemetry"
import { beforeEach, expect, test } from "vitest"
import { addDays } from "../days.ts"
import { countRejection, keepReport } from "../installs.ts"
import { testDatabase } from "../test/database.ts"
import { runDaily } from "./run.ts"

const TODAY = "2026-11-03"
const NIGHT = new Date(`${TODAY}T00:15:00Z`)
const YESTERDAY = "2026-11-02"

let db: ReturnType<typeof testDatabase>

beforeEach(() => {
  db = testDatabase()
})

const github = (tags: string[]) => async () =>
  Response.json(tags.map((tag_name) => ({ tag_name })))

/** `servers` servers like this one, each last reporting on `day`. */
async function report(
  servers: number,
  changes: Partial<TelemetryReport> = {},
  day = YESTERDAY
) {
  for (let i = 0; i < servers; i++) {
    await keepReport(
      db,
      {
        installId: randomUUID(),
        version: "0.1.0-alpha.2",
        install: "docker",
        arch: "x64",
        database: "sqlite",
        modules: { ai: true, photos: false },
        aiProviders: ["anthropic"],
        households: "1",
        people: "2-5",
        recipes: "100-499",
        ...changes,
      },
      day
    )
  }
}

test("count the past week's servers, with only releases named", async () => {
  await report(6)
  await report(5, { version: "0.1.0-alpha.3", arch: "arm64" })
  await report(5, { version: "0.0.0-edge.1a2b3c4" }, addDays(YESTERDAY, -6))
  await report(2, { version: "0.9.9-made-up" })
  // A week and a day ago: not counted, but kept for now.
  await report(4, {}, addDays(YESTERDAY, -7))

  const totals = await runDaily(
    { DB: db },
    NIGHT,
    github(["v0.1.0-alpha.2", "v0.1.0-alpha.3"])
  )

  expect(totals).toMatchObject({
    day: YESTERDAY,
    servers: 18,
    new: 13,
    flagged: false,
    versions: {
      "0.1.0-alpha.3": 5,
      "0.1.0-alpha.2": 6,
      Edge: 5,
      Other: 2,
    },
    install: { docker: 18 },
    arch: { x64: 13, arm64: 5 },
    modules: { ai: 18, photos: 0 },
    aiReported: 18,
    aiProviders: { anthropic: 18 },
    households: { "1": 18 },
    people: { "2-5": 18 },
  })
  expect(Object.keys(totals.versions)).toEqual([
    "0.1.0-alpha.3",
    "0.1.0-alpha.2",
    "Edge",
    "Other",
  ])
  expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM installs").get()).toEqual(
    { n: 22 }
  )
})

test("fold anything fewer than five servers report into Other", async () => {
  await report(9, { recipes: "1-99" })
  await report(3, { recipes: "2000+", database: "postgres 18" })
  await report(1, {
    modules: { ai: true, photos: false, made: true },
    aiProviders: ["openai", "made-up"],
  })
  await report(6, { aiProviders: [] })

  const totals = await runDaily({ DB: db }, NIGHT, github([]))

  expect(totals.recipes).toEqual({ "1-99": 9, "100-499": 7, Other: 3 })
  expect(totals.database).toEqual({ sqlite: 16, Other: 3 })
  // Ids are named only once five servers mention them.
  expect(totals.modules).toEqual({ ai: 19, photos: 0 })
  expect(totals.aiProviders).toEqual({ anthropic: 12, none: 6 })
})

test("count servers from 0.1.0-alpha.1 without guessing their AI", async () => {
  await report(5)
  await report(5, { aiProviders: undefined })
  const totals = await runDaily({ DB: db }, NIGHT, github([]))
  expect(totals.servers).toBe(10)
  expect(totals.aiReported).toBe(5)
  expect(totals.aiProviders).toEqual({ anthropic: 5 })
})

test("forget servers 30 days after their last report", async () => {
  await report(1, {}, addDays(TODAY, -30))
  await report(1, {}, addDays(TODAY, -31))
  await runDaily({ DB: db }, NIGHT, github([]))
  expect(db.sqlite.prepare("SELECT last_day FROM installs").all()).toEqual([
    { last_day: addDays(TODAY, -30) },
  ])
})

test("flag a day with far more new servers than usual", async () => {
  for (let back = 30; back >= 2; back--) {
    db.sqlite
      .prepare("INSERT INTO days (day, totals) VALUES (?, ?)")
      .run(addDays(YESTERDAY, -back + 1), JSON.stringify({ new: 4 }))
  }
  await report(150)
  expect((await runDaily({ DB: db }, NIGHT, github([]))).flagged).toBe(true)
})

test("keep the releases it knows when GitHub can't be reached", async () => {
  await runDaily({ DB: db }, NIGHT, github(["v0.1.0-alpha.2"]))
  await report(5)
  const down = async () => {
    throw new Error("offline")
  }
  const totals = await runDaily({ DB: db }, NIGHT, down)
  expect(totals.versions).toEqual({ "0.1.0-alpha.2": 5 })
})

test("include the day's turned-down summaries", async () => {
  await countRejection(db, YESTERDAY, "invalid_version")
  await countRejection(db, YESTERDAY, "invalid_version")
  const totals = await runDaily({ DB: db }, NIGHT, github([]))
  expect(totals.rejected).toEqual({ invalid_version: 2 })
})
