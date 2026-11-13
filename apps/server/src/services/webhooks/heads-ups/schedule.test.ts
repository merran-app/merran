import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { Job } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import {
  createTestApp,
  setUpServer,
  type TestClient,
} from "../../../test/app.ts"
import { eventsFrom } from "../../../test/webhooks.ts"
import type { JobRunner } from "../../jobs/runner.ts"
import { configureWebhooks } from "../state.ts"
import {
  HEADS_UP_EVERY_MS,
  HEADS_UP_JOB,
  scheduleHeadsUps,
  sendHeadsUps,
  startHeadsUps,
  stopHeadsUps,
} from "./schedule.ts"

// The schedule: queued only while some webhook on the server wants a
// heads-up, every 5 minutes, each run queueing the next; and a household
// hears only the heads-ups its webhooks want.

let app: App
let database: Database
let jobs: JobRunner
let close: () => Promise<void>
let kyle: TestClient
let home: string

const WEBHOOKS = "/api/households/current/webhooks"
const PUBLIC_URL = "http://merran.test"

beforeAll(async () => {
  const test = await createTestApp({ publicUrl: PUBLIC_URL })
  ;({ app, database, jobs, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  const household = await kyle.patch("/api/households/current", {
    timeZone: "UTC",
    weekStartsOn: 1,
    country: "US",
  })
  home = (await household.json()).id
  const allowed = await kyle.patch("/api/settings/server", {
    "webhooks.homeNetwork": "all",
  })
  expect(allowed.status).toBe(200)
  // As the server does once its job runner has started.
  await startHeadsUps(database.em.fork())
})

afterAll(async () => {
  stopHeadsUps()
  await close()
})

async function addWebhook(events: string[]): Promise<string> {
  const res = await kyle.post(WEBHOOKS, {
    name: events.join(" "),
    address: "http://127.0.0.1:9/h",
    events,
    everything: false,
    headers: [],
  })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()).webhook.id
}

async function changeWebhook(id: string, changes: Record<string, unknown>) {
  const res = await kyle.patch(`${WEBHOOKS}/${id}`, changes)
  expect(res.status, await res.clone().text()).toBe(200)
}

function waiting() {
  return database.em.fork().find(Job, { kind: HEADS_UP_JOB, status: "queued" })
}

/**
 * Runs the waiting run now, rather than at its mark, as if its mark had
 * come: a run before it would find the next mark is its own.
 */
async function runNow() {
  const now = new Date()
  const mark = new Date(
    Math.floor(now.getTime() / HEADS_UP_EVERY_MS) * HEADS_UP_EVERY_MS
  )
  await database.em
    .fork()
    .nativeUpdate(
      Job,
      { kind: HEADS_UP_JOB, status: "queued" },
      { runAt: now, key: `schedule:webhooks:${mark.toISOString()}` }
    )
  await jobs.drain()
}

describe("the schedule", () => {
  let summary: string

  test("waits until a webhook wants a heads-up", async () => {
    expect(await waiting()).toEqual([])
    const recipes = await addWebhook(["recipe.created"])
    expect(await waiting()).toEqual([])

    const before = Date.now()
    await changeWebhook(recipes, { events: ["recipe.created", "day.summary"] })
    const [next, ...more] = await waiting()
    expect(more).toEqual([])
    // At the next 5-minute mark, as the server's.
    expect(next!.runAt.getTime() % HEADS_UP_EVERY_MS).toBe(0)
    expect(next!.runAt.getTime()).toBeGreaterThan(before)
    expect(next!.runAt.getTime()).toBeLessThanOrEqual(
      Date.now() + HEADS_UP_EVERY_MS
    )
    expect(next!.key).toBe(`schedule:webhooks:${next!.runAt.toISOString()}`)
    expect(next!.forHousehold).toBeNull()

    // Another that wants one doesn't queue a second.
    summary = await addWebhook(["meal.time_to_start"])
    expect(await waiting()).toHaveLength(1)
    await changeWebhook(recipes, { events: ["recipe.created"] })
  })

  test("each run queues the next, until nothing wants one", async () => {
    const [first] = await waiting()
    await runNow()
    const done = await database.em.fork().findOneOrFail(Job, first!.id)
    expect(done.status).toBe("done")
    expect(done.result).toEqual({ summaries: 0, useSoon: 0, starts: 0 })

    const [next] = await waiting()
    expect(next!.id).not.toBe(first!.id)
    // It remembers when this run was, for the next to look from.
    const since = Date.parse(String(next!.payload.since))
    expect(since).toBeGreaterThanOrEqual(done.startedAt!.getTime())
    expect(since).toBeLessThanOrEqual(done.finishedAt!.getTime())

    // Paused, nothing wants one: the run waiting is the last.
    await changeWebhook(summary, { paused: true })
    await runNow()
    expect(await waiting()).toEqual([])

    // Resumed, it's back.
    await changeWebhook(summary, { paused: false })
    expect(await waiting()).toHaveLength(1)
  })

  test("nothing is queued while webhooks are off", async () => {
    await database.em
      .fork()
      .nativeDelete(Job, { kind: HEADS_UP_JOB, status: "queued" })
    configureWebhooks({ enabled: false, publicUrl: PUBLIC_URL })
    try {
      expect(await scheduleHeadsUps(database.em.fork())).toBeNull()
      expect(await waiting()).toEqual([])
    } finally {
      configureWebhooks({ enabled: true, publicUrl: PUBLIC_URL })
    }
    expect(await scheduleHeadsUps(database.em.fork())).not.toBeNull()
  })
})

describe("what a household hears", () => {
  test("only the heads-ups its webhooks want", async () => {
    // Only "time to start" is wanted: 07:00 UTC passes with no summary.
    const quiet = await eventsFrom(database, home, () =>
      sendHeadsUps(database, {
        since: new Date("2027-04-01T06:55:00.000Z"),
        now: new Date("2027-04-01T07:00:01.000Z"),
      })
    )
    expect(quiet).toEqual([])

    await addWebhook(["day.summary"])
    const sent = await eventsFrom(database, home, () =>
      sendHeadsUps(database, {
        since: new Date("2027-04-02T06:55:00.000Z"),
        now: new Date("2027-04-02T07:00:01.000Z"),
      })
    )
    expect(sent.map((event) => [event.type, event.date])).toEqual([
      ["day.summary", "2027-04-02"],
    ])
  })
})
