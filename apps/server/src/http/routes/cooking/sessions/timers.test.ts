import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import {
  CookingSession,
  CookingTimer,
  Job,
} from "../../../../database/entities/index.ts"
import type { Database } from "../../../../database/orm.ts"
import type { JobRunner } from "../../../../services/jobs/runner.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  type TestClient,
} from "../../../../test/app.ts"
import {
  eventsFrom,
  listenToEverything,
  type SentEvent,
} from "../../../../test/webhooks.ts"

// Timers from cook view, kept on the server so it sends timer.finished on
// time, and so leaving cook view with one running waits for it.

let database: Database
let jobs: JobRunner
let close: () => Promise<void>
let kyle: TestClient
let sam: TestClient
let home: string
let soup: { id: string }

beforeAll(async () => {
  const test = await createTestApp({ publicUrl: "http://merran.test" })
  let app: App
  ;({ app, database, jobs, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  home = (
    await (
      await kyle.patch("/api/households/current", {
        timeZone: "UTC",
        weekStartsOn: 1,
        country: "US",
      })
    ).json()
  ).id
  sam = await join(app, await inviteToken(kyle), account("sam", "Sam"))
  const res = await kyle.post("/api/recipes", {
    name: "Tomato Soup",
    ingredients: ["1 onion"],
    steps: ["Simmer for 10 minutes."],
  })
  soup = await res.json()
  await listenToEverything(kyle)
})

afterAll(() => close())

// Each test starts with nobody cooking and no timer running.
beforeEach(async () => {
  const em = database.em.fork()
  await em.nativeUpdate(
    CookingTimer,
    { state: "running" },
    { state: "cancelled" },
    { filters: false }
  )
  await em.nativeUpdate(
    CookingSession,
    { endedAt: null },
    { endedAt: new Date(), outcome: "stopped" },
    { filters: false }
  )
})

async function startCooking(): Promise<string> {
  const res = await kyle.post("/api/cooking/sessions", { recipe: soup.id })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()).id
}

async function setTimer(
  session: string,
  timer: string,
  seconds: number,
  as = kyle
) {
  return as.put(`/api/cooking/sessions/${session}/timers/${timer}`, {
    label: "Simmer the sauce",
    seconds,
  })
}

/** Lets every running timer go off now, as if its time had come. */
async function finishTimersNow(timerIds?: string[]) {
  const em = database.em.fork()
  await em.nativeUpdate(
    CookingTimer,
    {
      state: "running",
      ...(timerIds ? { timerId: { $in: timerIds } } : {}),
    },
    { endsAt: new Date(Date.now() - 1000) },
    { filters: false }
  )
  const due = await em.find(
    CookingTimer,
    {
      state: "running",
      ...(timerIds ? { timerId: { $in: timerIds } } : {}),
    },
    { filters: false }
  )
  await em.nativeUpdate(
    Job,
    {
      kind: "cooking.timerDone",
      status: "queued",
      key: { $in: due.map((timer) => `cooking.timer:${timer.id}`) },
    },
    { runAt: new Date() }
  )
  await jobs.drain()
}

const sent = (action: () => Promise<unknown>) =>
  eventsFrom(database, home, action)

const ofType = (events: SentEvent[], type: string) =>
  events.filter((event) => event.type === type)

describe("a timer", () => {
  test("starting sends timer.started, ending when the server says", async () => {
    const session = await startCooking()
    const before = Date.now()

    const events = await sent(async () => {
      const res = await setTimer(session, "t-1", 600)
      expect(res.status, await res.clone().text()).toBe(200)
    })

    const started = ofType(events, "timer.started")
    expect(started).toHaveLength(1)
    expect(started[0]).toMatchObject({
      by: { name: "Kyle" },
      via: "app",
      cook: { name: "Kyle" },
      session: { id: session },
      timer: { id: "t-1", label: "Simmer the sauce", seconds: 600 },
    })
    // Seconds left are counted from the server's clock.
    const endsAt = Date.parse(started[0]!.timer.endsAt)
    expect(endsAt).toBeGreaterThanOrEqual(before + 600_000)
    expect(endsAt).toBeLessThan(Date.now() + 600_000 + 2000)
  })

  test("+1 minute sends timer.extended, and moves its job", async () => {
    const session = await startCooking()
    await setTimer(session, "t-1", 600)

    // A minute more than the 599 or so left.
    const events = await sent(async () => {
      const res = await setTimer(session, "t-1", 659)
      expect(res.status, await res.clone().text()).toBe(200)
    })

    const extended = ofType(events, "timer.extended")
    expect(extended).toHaveLength(1)
    expect(extended[0]!.timer.seconds).toBeGreaterThanOrEqual(659)
    expect(extended[0]!.timer.seconds).toBeLessThanOrEqual(661)
    expect(ofType(events, "timer.started")).toEqual([])

    const timer = await database.em.fork().findOneOrFail(
      CookingTimer,
      { timerId: "t-1", session },
      {
        filters: false,
      }
    )
    const waiting = await database.em.fork().find(Job, {
      key: `cooking.timer:${timer.id}`,
      status: "queued",
    })
    expect(waiting).toHaveLength(1)
    expect(waiting[0]!.runAt.getTime()).toBe(timer.endsAt.getTime())
  })

  test("the server sends timer.finished, as Merran", async () => {
    const session = await startCooking()
    await setTimer(session, "t-1", 600)

    const events = await sent(() => finishTimersNow())

    const finished = ofType(events, "timer.finished")
    expect(finished).toHaveLength(1)
    expect(finished[0]).toMatchObject({
      by: null,
      via: "merran",
      cook: { name: "Kyle" },
      timer: { id: "t-1" },
    })
  })

  test("+1 minute on a finished timer runs it again", async () => {
    const session = await startCooking()
    await setTimer(session, "t-1", 600)
    await finishTimersNow()

    const events = await sent(async () => {
      await setTimer(session, "t-1", 60)
      await finishTimersNow()
    })

    expect(events.map((event) => event.type)).toEqual([
      "timer.extended",
      "timer.finished",
    ])
    expect(events[0]!.timer.seconds).toBe(660)
  })

  test("cancelling sends timer.cancelled, and it never goes off", async () => {
    const session = await startCooking()
    await setTimer(session, "t-1", 600)

    const events = await sent(async () => {
      const res = await kyle.delete(
        `/api/cooking/sessions/${session}/timers/t-1`
      )
      expect(res.status).toBe(204)
      await finishTimersNow()
    })

    expect(events.map((event) => event.type)).toEqual(["timer.cancelled"])
  })

  test("dismissing a finished timer sends nothing", async () => {
    const session = await startCooking()
    await setTimer(session, "t-1", 600)
    await finishTimersNow()

    const events = await sent(async () => {
      const res = await kyle.delete(
        `/api/cooking/sessions/${session}/timers/t-1`
      )
      expect(res.status).toBe(204)
    })

    expect(events).toEqual([])
  })

  test("another cook's timer is 404", async () => {
    const session = await startCooking()
    await setTimer(session, "t-1", 600)

    const set = await setTimer(session, "t-1", 60, sam)
    const cancelled = await sam.delete(
      `/api/cooking/sessions/${session}/timers/t-1`
    )

    expect(set.status).toBe(404)
    expect(cancelled.status).toBe(404)
  })
})

describe("leaving with timers running", () => {
  test("waits for the last timer", async () => {
    const session = await startCooking()
    await setTimer(session, "t-1", 300)
    await setTimer(session, "t-2", 600)

    const left = await sent(() =>
      kyle.post(`/api/cooking/sessions/${session}/end`)
    )
    expect(ofType(left, "cooking.ended")).toEqual([])

    const first = await sent(() => finishTimersNow(["t-1"]))
    expect(ofType(first, "cooking.ended")).toEqual([])

    const last = await sent(() => finishTimersNow(["t-2"]))
    expect(last.map((event) => event.type)).toEqual([
      "timer.finished",
      "cooking.ended",
    ])
    expect(last[1]).toMatchObject({
      by: null,
      via: "merran",
      cook: { name: "Kyle" },
      outcome: "stopped",
    })
  })

  test("cancelling the last timer ends a session that was left", async () => {
    const session = await startCooking()
    await setTimer(session, "t-1", 300)
    await kyle.post(`/api/cooking/sessions/${session}/end`)

    const events = await sent(() =>
      kyle.delete(`/api/cooking/sessions/${session}/timers/t-1`)
    )

    expect(events.map((event) => event.type)).toEqual([
      "timer.cancelled",
      "cooking.ended",
    ])
    expect(events[1]).toMatchObject({ outcome: "stopped" })
  })

  test("a new timer on an ended session is 404, but +1 still works", async () => {
    const session = await startCooking()
    await setTimer(session, "t-1", 300)
    // Left with the timer running, it ends when the timer goes off.
    await kyle.post(`/api/cooking/sessions/${session}/end`)
    await finishTimersNow()

    const added = await setTimer(session, "t-2", 300)
    const extended = await setTimer(session, "t-1", 360)

    expect(added.status).toBe(404)
    expect(extended.status, await extended.clone().text()).toBe(200)
  })
})
