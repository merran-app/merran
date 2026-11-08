import { addDays, clockIn } from "@merran/shared"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import { createTestApp, setUpServer, TestClient } from "../../../../test/app.ts"

// Did you make these? Past meals nobody marked, asked about on Today. The
// household's week starts today, so last week's pool is a week that's
// just over.

let app: App
let close: () => Promise<void>
let kyle: TestClient
let today: string
const ids: Record<string, string> = {}

type Meal = { id: string; date: string; anyDay: boolean; status: string }

async function plan(body: Record<string, unknown>) {
  const res = await kyle.post("/api/plan/entries", {
    meal: "dinner",
    recipe: ids["Lemon Chicken"],
    ...body,
  })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as Meal
}

async function unmarked(): Promise<Meal[]> {
  const res = await kyle.get("/api/plan/unmarked")
  expect(res.status, await res.clone().text()).toBe(200)
  return (await res.json()).entries
}

const idsOf = (meals: { id: string }[]) => meals.map((meal) => meal.id)

/** When the recipe was last made: when its latest cooked meal was. */
async function lastMade() {
  const recipe = await (
    await kyle.get(`/api/recipes/${ids["Lemon Chicken"]}`)
  ).json()
  return recipe.lastMadeAt
}

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  today = clockIn("UTC").today
  await kyle.patch("/api/households/current", {
    timeZone: "UTC",
    weekStartsOn: new Date(`${today}T12:00:00Z`).getUTCDay(),
    country: "US",
  })
  const res = await kyle.post("/api/recipes", {
    name: "Lemon Chicken",
    servings: 4,
    ingredients: ["2 lb chicken thighs", "2 lemons"],
    steps: ["Cook it."],
  })
  ids["Lemon Chicken"] = (await res.json()).id
})

afterAll(() => close())

afterEach(async () => {
  const entries = (
    await (
      await kyle.get(`/api/plan?from=${addDays(today, -21)}&to=${today}`)
    ).json()
  ).entries
  if (entries.length > 0) {
    await kyle.post("/api/plan/entries/bulk", {
      ids: entries.map((entry: { id: string }) => entry.id),
      action: "remove",
    })
  }
  await kyle.post("/api/pantry/clear")
})

describe("did you make these", () => {
  test("asks about planned meals from the past six days", async () => {
    const yesterday = await plan({ date: addDays(today, -1) })
    const sixDaysAgo = await plan({ date: addDays(today, -6) })
    await plan({ date: addDays(today, -7) })
    await plan({ date: today })

    expect(idsOf(await unmarked())).toEqual([sixDaysAgo.id, yesterday.id])
  })

  test("leaves out meals that were marked, and notes", async () => {
    const cooked = await plan({ date: addDays(today, -1) })
    await kyle.patch(`/api/plan/entries/${cooked.id}`, { status: "cooked" })
    const skipped = await plan({ date: addDays(today, -2) })
    await kyle.patch(`/api/plan/entries/${skipped.id}`, { status: "skipped" })
    await plan({ date: addDays(today, -3), recipe: null, note: "Eat out" })

    expect(await unmarked()).toEqual([])
  })

  test("asks about the pool of a week that's over, not this week's", async () => {
    const lastWeek = await plan({ date: addDays(today, -7), anyDay: true })
    await plan({ date: addDays(today, -14), anyDay: true })
    await plan({ date: today, anyDay: true })

    expect(await unmarked()).toMatchObject([
      { id: lastWeek.id, anyDay: true, status: "planned" },
    ])
  })

  test("Made it cooks it on its own day, and takes from the pantry", async () => {
    await kyle.post("/api/pantry/items", { text: "3 lb chicken thighs" })
    const meal = await plan({ date: addDays(today, -2) })
    const res = await kyle.patch(`/api/plan/entries/${meal.id}`, {
      status: "cooked",
    })
    expect(res.status).toBe(200)
    expect(await lastMade()).toBe(`${addDays(today, -2)}T12:00:00.000Z`)
    const pantry = (await (await kyle.get("/api/pantry")).json()).items
    expect(pantry).toMatchObject([{ name: "chicken thighs", amount: "1 lb" }])
    expect(await unmarked()).toEqual([])
  })

  test("Made it on last week's pool cooks it on that week's last day", async () => {
    const meal = await plan({ date: addDays(today, -7), anyDay: true })
    await kyle.patch(`/api/plan/entries/${meal.id}`, { status: "cooked" })
    expect(await lastMade()).toBe(`${addDays(today, -1)}T12:00:00.000Z`)
  })

  test("its own day is midday where the household is", async () => {
    await kyle.patch("/api/households/current", { timeZone: "Asia/Kolkata" })
    const local = clockIn("Asia/Kolkata").today
    const meal = await plan({ date: addDays(local, -1) })
    await kyle.patch(`/api/plan/entries/${meal.id}`, { status: "cooked" })
    expect(await lastMade()).toBe(`${addDays(local, -1)}T06:30:00.000Z`)
    await kyle.patch("/api/households/current", { timeZone: "UTC" })
  })

  test("Made them all cooks them together", async () => {
    const one = await plan({ date: addDays(today, -1) })
    const two = await plan({ date: addDays(today, -3) })
    const res = await kyle.post("/api/plan/entries/bulk", {
      ids: [one.id, two.id],
      action: "status",
      status: "cooked",
    })
    expect(res.status).toBe(200)
    expect((await res.json()).entries).toMatchObject([
      { id: two.id, status: "cooked" },
      { id: one.id, status: "cooked" },
    ])
    expect(await lastMade()).toBe(`${addDays(today, -1)}T12:00:00.000Z`)
    expect(await unmarked()).toEqual([])
  })

  test("needs the plan permission", async () => {
    const key = (
      await (
        await kyle.post("/api/auth/api-keys", {
          name: "Pantry",
          permissions: { pantry: "read" },
          expiresInDays: 30,
        })
      ).json()
    ).key
    const res = await app.request("http://merran.test/api/plan/unmarked", {
      headers: { authorization: `Bearer ${key}` },
    })
    expect(res.status).toBe(403)
  })
})
