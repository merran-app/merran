import { clockIn } from "@merran/shared"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import {
  CookingSession,
  CookingTimer,
  Job,
} from "../../../../database/entities/index.ts"
import type { Database } from "../../../../database/orm.ts"
import { enqueue } from "../../../../services/jobs/jobs.ts"
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

// How sessions end besides leaving cook view: going quiet, running for 12
// hours, and Made it, from the plan or off it. And the clean-up that
// clears them after a month.

let database: Database
let jobs: JobRunner
let close: () => Promise<void>
let kyle: TestClient
let sam: TestClient
let home: string
let soup: { id: string; slug: string }

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
    servings: 4,
    ingredients: ["1 onion"],
    steps: ["Simmer for 10 minutes."],
  })
  soup = await res.json()
  await listenToEverything(kyle)
})

afterAll(() => close())

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
  const today = clockIn("UTC").today
  const entries = (
    await (await kyle.get(`/api/plan?from=${today}&to=${today}`)).json()
  ).entries
  if (entries.length > 0) {
    await kyle.post("/api/plan/entries/bulk", {
      ids: entries.map((entry: { id: string }) => entry.id),
      action: "remove",
    })
  }
})

async function startCooking(as = kyle): Promise<string> {
  const res = await as.post("/api/cooking/sessions", { recipe: soup.id })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()).id
}

/** Moves a session's times back, as if it had been going that long. */
async function backdate(
  session: string,
  changes: { heardAt?: Date; startedAt?: Date; endedAt?: Date }
) {
  await database.em
    .fork()
    .nativeUpdate(CookingSession, { id: session }, changes, {
      filters: false,
    })
}

/** Runs the sweep for quiet sessions now, as its schedule would. */
async function sweepNow() {
  await enqueue(database.em.fork(), { kind: "cooking.endQuiet" })
  await jobs.drain()
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

const sent = (action: () => Promise<unknown>) =>
  eventsFrom(database, home, action)

const ofType = (events: SentEvent[], type: string) =>
  events.filter((event) => event.type === type)

async function stillCooking(session: string) {
  const sessions = (await (await kyle.get("/api/cooking/sessions")).json())
    .sessions as { id: string }[]
  return sessions.some((open) => open.id === session)
}

describe("going quiet", () => {
  test("no word for 30 minutes ends it as timed_out", async () => {
    const session = await startCooking()
    await backdate(session, {
      heardAt: minutesAgo(31),
      startedAt: minutesAgo(40),
    })

    const events = await sent(sweepNow)

    const ended = ofType(events, "cooking.ended")
    expect(ended).toHaveLength(1)
    expect(ended[0]).toMatchObject({
      by: null,
      via: "merran",
      cook: { name: "Kyle" },
      session: { id: session },
      outcome: "timed_out",
      minutes: 40,
    })
    expect(await stillCooking(session)).toBe(false)
  })

  test("29 minutes isn't quiet enough", async () => {
    const session = await startCooking()
    await backdate(session, { heardAt: minutesAgo(29) })

    const events = await sent(sweepNow)

    expect(ofType(events, "cooking.ended")).toEqual([])
    expect(await stillCooking(session)).toBe(true)
  })

  test("a running timer keeps a quiet session open", async () => {
    const session = await startCooking()
    await kyle.put(`/api/cooking/sessions/${session}/timers/t-1`, {
      label: "Roast",
      seconds: 3600,
    })
    await backdate(session, { heardAt: minutesAgo(45) })

    const events = await sent(sweepNow)

    expect(ofType(events, "cooking.ended")).toEqual([])
    expect(await stillCooking(session)).toBe(true)
  })

  test("12 hours ends it, timers or not", async () => {
    const session = await startCooking()
    await kyle.put(`/api/cooking/sessions/${session}/timers/t-1`, {
      label: "Proof the dough",
      seconds: 3600,
    })
    await backdate(session, { startedAt: minutesAgo(12 * 60 + 1) })

    const events = await sent(sweepNow)

    expect(ofType(events, "cooking.ended")[0]).toMatchObject({
      outcome: "timed_out",
    })
  })
})

describe("Made it", () => {
  test("off the plan ends it as made, after meal.cooked", async () => {
    const session = await startCooking()

    const events = await sent(async () => {
      const res = await kyle.post(`/api/recipes/${soup.id}/made`, {
        servings: 4,
        session,
      })
      expect(res.status, await res.clone().text()).toBe(200)
    })

    const types = events
      .map((event) => event.type)
      .filter((type) => type === "meal.cooked" || type === "cooking.ended")
    expect(types).toEqual(["meal.cooked", "cooking.ended"])
    expect(ofType(events, "cooking.ended")[0]).toMatchObject({
      by: { name: "Kyle" },
      via: "app",
      outcome: "made",
    })
    expect(await stillCooking(session)).toBe(false)
  })

  test("on the plan ends it as made", async () => {
    const meal = await (
      await kyle.post("/api/plan/entries", {
        date: clockIn("UTC").today,
        meal: "dinner",
        recipe: soup.slug,
      })
    ).json()
    const session = await startCooking()

    const events = await sent(async () => {
      const res = await kyle.patch(`/api/plan/entries/${meal.id}`, {
        status: "cooked",
        session,
      })
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(ofType(events, "cooking.ended")[0]).toMatchObject({
      outcome: "made",
    })
    expect(await stillCooking(session)).toBe(false)
  })

  test("a plan change that isn't Made it leaves it cooking", async () => {
    const meal = await (
      await kyle.post("/api/plan/entries", {
        date: clockIn("UTC").today,
        meal: "dinner",
        recipe: soup.slug,
      })
    ).json()
    const session = await startCooking()

    await kyle.patch(`/api/plan/entries/${meal.id}`, { servings: 6, session })

    expect(await stillCooking(session)).toBe(true)
  })

  test("with timers running ends it, and they still go off", async () => {
    const session = await startCooking()
    await kyle.put(`/api/cooking/sessions/${session}/timers/t-1`, {
      label: "Simmer",
      seconds: 600,
    })
    await kyle.post(`/api/recipes/${soup.id}/made`, { session })
    expect(await stillCooking(session)).toBe(false)

    const em = database.em.fork()
    await em.nativeUpdate(
      CookingTimer,
      { state: "running" },
      { endsAt: new Date(Date.now() - 1000) },
      { filters: false }
    )
    await em.nativeUpdate(
      Job,
      { kind: "cooking.timerDone", status: "queued" },
      { runAt: new Date() }
    )
    const events = await sent(() => jobs.drain())

    expect(events.map((event) => event.type)).toEqual(["timer.finished"])
  })

  test("with someone else's session still makes it, and leaves theirs", async () => {
    const theirs = await startCooking(sam)

    const res = await kyle.post(`/api/recipes/${soup.id}/made`, {
      session: theirs,
    })

    expect(res.status, await res.clone().text()).toBe(200)
    expect(await stillCooking(theirs)).toBe(true)
  })
})

describe("the clean-up", () => {
  test("clears sessions a month after they ended", async () => {
    const old = await startCooking()
    await kyle.post(`/api/cooking/sessions/${old}/end`)
    await backdate(old, { endedAt: minutesAgo(31 * 24 * 60) })
    const recent = await startCooking()
    await kyle.post(`/api/cooking/sessions/${recent}/end`)

    await enqueue(database.em.fork(), { kind: "jobs.cleanUp" })
    await jobs.drain()

    const left = await database.em
      .fork()
      .find(CookingSession, { id: { $in: [old, recent] } }, { filters: false })
    expect(left.map((session) => session.id)).toEqual([recent])
  })
})
