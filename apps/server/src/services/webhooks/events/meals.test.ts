import { addDays, clockIn, weekStartOf } from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import type { Database } from "../../../database/orm.ts"
import {
  createTestApp,
  setUpServer,
  type TestClient,
} from "../../../test/app.ts"
import {
  eventsFrom,
  gatherNow,
  listenToEverything,
  type SentEvent,
} from "../../../test/webhooks.ts"
import type { JobRunner } from "../../jobs/runner.ts"

// meal.cooked and meal.skipped: a meal marked made or Didn't, however that's
// done. Setting it back to planned, and Undo, send nothing.

let app: App
let database: Database
let jobs: JobRunner
let close: () => Promise<void>
let kyle: TestClient
let home: string
let today: string
let week: string

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
  today = clockIn("UTC").today
  week = weekStartOf(today, 1)
  for (const name of ["Tomato Soup", "Soda Bread"]) {
    const res = await kyle.post("/api/recipes", {
      name,
      servings: 4,
      ingredients: ["1 onion"],
      steps: ["Cook it."],
    })
    expect(res.status, await res.clone().text()).toBe(201)
  }
  await listenToEverything(kyle)
})

afterAll(() => close())

async function add(body: Record<string, unknown>) {
  const res = await kyle.post("/api/plan/entries", body)
  expect(res.status, await res.clone().text()).toBe(201)
  return res.json()
}

/** Takes everything off the plan, and lets what that gathered go. */
async function clearAll() {
  const plan = await (
    await kyle.get(
      `/api/plan?from=${addDays(week, -7)}&to=${addDays(week, 20)}`
    )
  ).json()
  const ids = plan.entries.map((entry: { id: string }) => entry.id)
  if (ids.length > 0) {
    await kyle.post("/api/plan/entries/bulk", { ids, action: "remove" })
  }
  await gatherNow(database, jobs)
}

/** The events an action sends, with what it gathered let go. */
async function sentBy(action: () => Promise<unknown>) {
  return eventsFrom(database, home, async () => {
    await action()
    await gatherNow(database, jobs)
  })
}

const ofType = (events: SentEvent[], type: string) =>
  events.filter((event) => event.type === type)

async function setStatus(id: string, body: Record<string, unknown>) {
  const res = await kyle.patch(`/api/plan/entries/${id}`, body)
  expect(res.status, await res.clone().text()).toBe(200)
}

describe("meal.cooked", () => {
  test("Made it on a planned meal", async () => {
    await clearAll()
    const soup = await add({
      date: today,
      meal: "dinner",
      recipe: "tomato-soup",
    })
    await gatherNow(database, jobs)

    const sent = await sentBy(() =>
      setStatus(soup.id, { status: "cooked", servings: 3 })
    )

    const cooked = ofType(sent, "meal.cooked")
    expect(cooked).toHaveLength(1)
    expect(cooked[0]).toMatchObject({
      entryId: soup.id,
      date: today,
      meal: "dinner",
      pool: false,
      title: "Tomato Soup",
      recipe: { slug: "tomato-soup", title: "Tomato Soup" },
      side: null,
      servings: 3,
      planned: true,
      by: { name: "Kyle" },
      via: "app",
    })
  })

  test("without servings it says the recipe's", async () => {
    await clearAll()
    const soup = await add({
      date: today,
      meal: "dinner",
      recipe: "tomato-soup",
    })

    const sent = await sentBy(() => setStatus(soup.id, { status: "cooked" }))

    expect(ofType(sent, "meal.cooked")[0]).toMatchObject({ servings: 4 })
  })

  test("Made it off the plan adds the meal, planned: false", async () => {
    await clearAll()

    const sent = await sentBy(async () => {
      const res = await kyle.post("/api/recipes/tomato-soup/made", {})
      expect(res.status, await res.clone().text()).toBe(200)
    })

    const cooked = ofType(sent, "meal.cooked")
    expect(cooked).toHaveLength(1)
    expect(cooked[0]).toMatchObject({
      date: today,
      pool: false,
      title: "Tomato Soup",
      planned: false,
    })
    expect(ofType(sent, "plan.changed")).toHaveLength(1)
  })

  test("Made it with servings says how many", async () => {
    await clearAll()

    const sent = await sentBy(async () => {
      const res = await kyle.post("/api/recipes/tomato-soup/made", {
        servings: 8,
      })
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(ofType(sent, "meal.cooked")[0]).toMatchObject({ servings: 8 })
  })

  test("Made it on a meal in the week's pool is planned", async () => {
    await clearAll()
    await add({
      date: week,
      meal: "dinner",
      anyDay: true,
      recipe: "tomato-soup",
    })
    await gatherNow(database, jobs)

    const sent = await sentBy(async () => {
      const res = await kyle.post("/api/recipes/tomato-soup/made", {})
      expect(res.status, await res.clone().text()).toBe(200)
    })

    const cooked = ofType(sent, "meal.cooked")
    expect(cooked).toHaveLength(1)
    expect(cooked[0]).toMatchObject({ date: today, pool: false, planned: true })
    expect(ofType(sent, "plan.changed")[0]).toMatchObject({
      moved: 1,
      added: 0,
    })
  })

  test("Made it twice on the same day sends one", async () => {
    await clearAll()

    const sent = await sentBy(async () => {
      for (let time = 0; time < 2; time += 1) {
        const res = await kyle.post("/api/recipes/tomato-soup/made", {})
        expect(res.status, await res.clone().text()).toBe(200)
      }
    })

    expect(ofType(sent, "meal.cooked")).toHaveLength(1)
  })

  test("Made them all on Today sends one for each meal", async () => {
    await clearAll()
    const soup = await add({
      date: today,
      meal: "dinner",
      recipe: "tomato-soup",
    })
    const bread = await add({
      date: today,
      meal: "lunch",
      recipe: "soda-bread",
    })

    const sent = await sentBy(async () => {
      const res = await kyle.post("/api/plan/entries/bulk", {
        ids: [soup.id, bread.id],
        action: "status",
        status: "cooked",
      })
      expect(res.status, await res.clone().text()).toBe(200)
    })

    const cooked = ofType(sent, "meal.cooked")
    expect(cooked.map((event) => event.entryId).sort()).toEqual(
      [soup.id, bread.id].sort()
    )
    expect(cooked.every((event) => event.planned)).toBe(true)
  })

  test("a meal that's only a note has no recipe", async () => {
    await clearAll()
    const pizza = await add({ date: today, meal: "dinner", note: "Pizza out" })

    const sent = await sentBy(() => setStatus(pizza.id, { status: "cooked" }))

    expect(ofType(sent, "meal.cooked")[0]).toMatchObject({
      title: "Pizza out",
      recipe: null,
      side: null,
      servings: null,
    })
  })

  test("a meal with a side names it", async () => {
    await clearAll()
    const soup = await add({
      date: today,
      meal: "dinner",
      recipe: "tomato-soup",
      withRecipe: "soda-bread",
    })

    const sent = await sentBy(() => setStatus(soup.id, { status: "cooked" }))

    expect(ofType(sent, "meal.cooked")[0]).toMatchObject({
      side: { slug: "soda-bread" },
    })
  })

  test("marking a meal that's cooked already sends nothing more", async () => {
    await clearAll()
    const soup = await add({
      date: today,
      meal: "dinner",
      recipe: "tomato-soup",
    })
    await setStatus(soup.id, { status: "cooked" })
    await gatherNow(database, jobs)

    const sent = await sentBy(() =>
      setStatus(soup.id, { status: "cooked", servings: 5 })
    )

    expect(ofType(sent, "meal.cooked")).toEqual([])
  })
})

describe("meal.skipped", () => {
  test("Didn't sends it, and setting it back sends nothing more", async () => {
    await clearAll()
    const soup = await add({
      date: today,
      meal: "dinner",
      recipe: "tomato-soup",
    })
    await gatherNow(database, jobs)

    const skipped = await sentBy(() =>
      setStatus(soup.id, { status: "skipped" })
    )
    expect(ofType(skipped, "meal.skipped")).toHaveLength(1)
    expect(ofType(skipped, "meal.skipped")[0]).toMatchObject({
      entryId: soup.id,
      date: today,
      meal: "dinner",
      title: "Tomato Soup",
    })

    const back = await sentBy(() => setStatus(soup.id, { status: "planned" }))
    expect(
      back.filter((e) => e.type === "meal.skipped" || e.type === "meal.cooked")
    ).toEqual([])
  })
})

describe("Undo", () => {
  test("never makes or skips a meal again", async () => {
    await clearAll()
    const soup = await add({
      date: today,
      meal: "dinner",
      recipe: "tomato-soup",
    })
    await setStatus(soup.id, { status: "cooked" })
    await gatherNow(database, jobs)
    const removed = await kyle.post("/api/plan/entries/bulk", {
      ids: [soup.id],
      action: "remove",
    })
    const { before } = await removed.json()
    await gatherNow(database, jobs)

    const sent = await sentBy(async () => {
      const res = await kyle.post("/api/plan/restore", { entries: before })
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(sent.map((event) => event.type)).toEqual(["plan.changed"])
  })
})

// Last, because it takes the household's webhooks away.
describe("a household without webhooks", () => {
  test("marking a meal made or Didn't records nothing", async () => {
    await clearAll()
    const soup = await add({
      date: today,
      meal: "dinner",
      recipe: "tomato-soup",
    })
    const bread = await add({
      date: today,
      meal: "lunch",
      recipe: "soda-bread",
    })
    const listed = await (
      await kyle.get("/api/households/current/webhooks")
    ).json()
    for (const webhook of listed.webhooks ?? listed) {
      const res = await kyle.delete(
        `/api/households/current/webhooks/${webhook.id}`
      )
      expect(res.status, await res.clone().text()).toBeLessThan(300)
    }

    const sent = await sentBy(async () => {
      await setStatus(soup.id, { status: "cooked" })
      await setStatus(bread.id, { status: "skipped" })
    })

    expect(sent).toEqual([])
  })
})
