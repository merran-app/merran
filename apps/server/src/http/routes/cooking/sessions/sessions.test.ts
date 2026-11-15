import { clockIn } from "@merran/shared"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import { CookingSession, Job } from "../../../../database/entities/index.ts"
import type { Database } from "../../../../database/orm.ts"
import type { JobRunner } from "../../../../services/jobs/runner.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TEST_ORIGIN,
  type TestClient,
} from "../../../../test/app.ts"
import {
  eventsFrom,
  listenToEverything,
  type SentEvent,
} from "../../../../test/webhooks.ts"

// Cooking sessions: cook view says when cooking starts, checks in while
// it's open, and says when it's left or its page goes away
// (docs/webhooks.md, "Cooking sessions and timers").

let app: App
let database: Database
let jobs: JobRunner
let close: () => Promise<void>
let kyle: TestClient
let sam: TestClient
let home: string
let soup: { id: string; slug: string }
let rice: { id: string; slug: string }

beforeAll(async () => {
  const test = await createTestApp({ publicUrl: "http://merran.test" })
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
  soup = await recipe("Tomato Soup")
  rice = await recipe("Garlic Rice")
  await listenToEverything(kyle)
})

afterAll(() => close())

// Each test starts with nobody cooking.
beforeEach(async () => {
  await database.em
    .fork()
    .nativeUpdate(
      CookingSession,
      { endedAt: null },
      { endedAt: new Date(), outcome: "stopped" },
      { filters: false }
    )
})

async function recipe(name: string) {
  const res = await kyle.post("/api/recipes", {
    name,
    servings: 4,
    ingredients: ["1 onion"],
    steps: ["Cook it."],
  })
  expect(res.status, await res.clone().text()).toBe(201)
  return res.json()
}

async function start(body: Record<string, unknown>, as = kyle) {
  const res = await as.post("/api/cooking/sessions", body)
  expect(res.status, await res.clone().text()).toBe(201)
  return res.json()
}

async function cooking(as = kyle) {
  const res = await as.get("/api/cooking/sessions")
  expect(res.status, await res.clone().text()).toBe(200)
  return (await res.json()).sessions
}

const sent = (action: () => Promise<unknown>) =>
  eventsFrom(database, home, action)

const ofType = (events: SentEvent[], type: string) =>
  events.filter((event) => event.type === type)

/** Runs the close jobs that are waiting, as if their minute had passed. */
async function closeNow() {
  const em = database.em.fork()
  await em.nativeUpdate(
    CookingSession,
    { closingAt: { $ne: null } },
    { closingAt: new Date(Date.now() - 1000) },
    { filters: false }
  )
  await em.nativeUpdate(
    Job,
    { kind: "cooking.closeSession", status: "queued" },
    { runAt: new Date() }
  )
  await jobs.drain()
}

/** Calls the API with an API key, as Home Assistant would. */
function withKey(key: string, method: string, path: string, body?: unknown) {
  return app.request(`${TEST_ORIGIN}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function apiKey(permissions: Record<string, string>) {
  const res = await kyle.post("/api/auth/api-keys", {
    name: "Home Assistant",
    permissions,
    expiresInDays: 30,
  })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()).key as string
}

describe("starting", () => {
  test("sends cooking.started, and lists the session", async () => {
    const today = clockIn("UTC").today
    const meal = await (
      await kyle.post("/api/plan/entries", {
        date: today,
        meal: "dinner",
        recipe: soup.slug,
      })
    ).json()

    let session: { id: string } | undefined
    const events = await sent(async () => {
      session = await start({
        recipe: soup.id,
        with: rice.id,
        meal: meal.id,
        servings: 3,
      })
    })

    const started = ofType(events, "cooking.started")
    expect(started).toHaveLength(1)
    expect(started[0]).toMatchObject({
      by: { name: "Kyle" },
      via: "app",
      cook: { name: "Kyle" },
      session: { id: session!.id },
      recipe: { slug: "tomato-soup", title: "Tomato Soup" },
      with: { slug: "garlic-rice" },
      meal: { entryId: meal.id, meal: "dinner" },
      servings: 3,
    })

    const listed = await cooking()
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      id: session!.id,
      cook: { name: "Kyle" },
      recipe: { slug: "tomato-soup" },
      leaving: false,
      endedAt: null,
      timers: [],
    })
    await kyle.delete(`/api/plan/entries/${meal.id}`)
  })

  test("an unknown recipe is 404", async () => {
    const res = await kyle.post("/api/cooking/sessions", {
      recipe: "no-such-recipe",
    })
    expect(res.status).toBe(404)
  })
})

describe("checking in", () => {
  test("changes servings and sends nothing", async () => {
    const session = await start({ recipe: soup.id, servings: 4 })

    const events = await sent(async () => {
      const res = await kyle.patch(`/api/cooking/sessions/${session.id}`, {
        servings: 6,
      })
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(events).toEqual([])
    expect((await cooking())[0].servings).toBe(6)
  })

  test("an ended session is 404", async () => {
    const session = await start({ recipe: soup.id })
    await kyle.post(`/api/cooking/sessions/${session.id}/end`)

    const res = await kyle.patch(`/api/cooking/sessions/${session.id}`, {})
    expect(res.status).toBe(404)
  })
})

describe("leaving", () => {
  test("with no timer running ends it at once, as the cook", async () => {
    const session = await start({ recipe: soup.id })

    const events = await sent(() =>
      kyle.post(`/api/cooking/sessions/${session.id}/end`)
    )

    const ended = ofType(events, "cooking.ended")
    expect(ended).toHaveLength(1)
    expect(ended[0]).toMatchObject({
      by: { name: "Kyle" },
      via: "app",
      cook: { name: "Kyle" },
      session: { id: session.id },
      outcome: "stopped",
      minutes: 0,
    })
    expect(await cooking()).toEqual([])
  })

  test("check-in clears a close that's coming", async () => {
    const session = await start({ recipe: soup.id })

    const events = await sent(async () => {
      await kyle.post(`/api/cooking/sessions/${session.id}/end`, {
        soon: true,
      })
      expect((await cooking())[0].leaving).toBe(true)
      await kyle.patch(`/api/cooking/sessions/${session.id}`, {})
      await closeNow()
    })

    expect(ofType(events, "cooking.ended")).toEqual([])
    const listed = await cooking()
    expect(listed).toHaveLength(1)
    expect(listed[0].leaving).toBe(false)
  })

  test("a close that comes ends it as Merran", async () => {
    const session = await start({ recipe: soup.id })
    await kyle.post(`/api/cooking/sessions/${session.id}/end`, { soon: true })

    const events = await sent(closeNow)

    const ended = ofType(events, "cooking.ended")
    expect(ended).toHaveLength(1)
    expect(ended[0]).toMatchObject({
      by: null,
      via: "merran",
      key: null,
      cook: { name: "Kyle" },
      outcome: "stopped",
    })
    expect(await cooking()).toEqual([])
  })

  test("a recipe deleted mid-cook still names it", async () => {
    const stew = await recipe("Beef Stew")
    const session = await start({ recipe: stew.id })
    await kyle.delete(`/api/recipes/${stew.id}`)

    const events = await sent(() =>
      kyle.post(`/api/cooking/sessions/${session.id}/end`)
    )

    expect(ofType(events, "cooking.ended")[0]).toMatchObject({
      recipe: { title: "Beef Stew" },
    })
  })
})

describe("whose it is", () => {
  test("another cook's session is 404, and stays open", async () => {
    const session = await start({ recipe: soup.id })

    const patched = await sam.patch(`/api/cooking/sessions/${session.id}`, {})
    const ended = await sam.post(`/api/cooking/sessions/${session.id}/end`)

    expect(patched.status).toBe(404)
    expect(ended.status).toBe(404)
    // Anyone in the household can see who's cooking.
    expect(await cooking(sam)).toHaveLength(1)
  })

  test("API keys read with plan read, and start with plan write", async () => {
    await start({ recipe: soup.id })
    const reader = await apiKey({ plan: "read" })
    const writer = await apiKey({ plan: "write" })

    const read = await withKey(reader, "GET", "/api/cooking/sessions")
    expect(read.status).toBe(200)
    const { sessions } = (await read.json()) as { sessions: unknown[] }
    expect(sessions).toHaveLength(1)

    const refused = await withKey(reader, "POST", "/api/cooking/sessions", {
      recipe: soup.id,
    })
    expect(refused.status).toBe(403)

    const started = await withKey(writer, "POST", "/api/cooking/sessions", {
      recipe: soup.id,
    })
    expect(started.status, await started.clone().text()).toBe(201)
  })

  test("signed out is 401, so guests never report", async () => {
    const res = await app.request(`${TEST_ORIGIN}/api/cooking/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: TEST_ORIGIN },
      body: JSON.stringify({ recipe: soup.id }),
    })
    expect(res.status).toBe(401)
  })
})
