import { clockIn, MEALS, weekStartOf } from "@merran/shared"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import {
  createTestApp,
  setUpServer,
  TestClient,
} from "../../../../../test/app.ts"

// I made this: a meal of it today is cooked, or one's added, cooked, so
// it takes from the pantry like any cooked meal. In a household on UTC
// whose week starts on Monday.

let app: App
let close: () => Promise<void>
let kyle: TestClient
let today: string

type Meal = {
  id: string
  date: string
  meal: string
  anyDay: boolean
  status: string
  servings: number | null
  recipe: { id: string } | null
}

async function mealsToday(): Promise<Meal[]> {
  return (await (await kyle.get(`/api/plan?from=${today}&to=${today}`)).json())
    .entries
}

async function made(recipe: string, body?: unknown) {
  const res = await kyle.post(`/api/recipes/${recipe}/made`, body)
  expect(res.status, await res.clone().text()).toBe(200)
  return res.json()
}

async function chicken() {
  const items = (await (await kyle.get("/api/pantry")).json()).items
  return items.find((item: { name: string }) => item.name === "chicken thighs")
}

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  await kyle.patch("/api/households/current", {
    timeZone: "UTC",
    weekStartsOn: 1,
    country: "US",
  })
  today = clockIn("UTC").today
  await kyle.post("/api/recipes", { name: "Soup" })
  await kyle.post("/api/recipes", {
    name: "Lemon Chicken",
    servings: 4,
    ingredients: ["2 lb chicken thighs", "2 lemons"],
    steps: ["Cook it."],
  })
})

afterAll(() => close())

afterEach(async () => {
  const week = weekStartOf(today, 1)
  const entries = (
    await (await kyle.get(`/api/plan?from=${week}&to=${today}`)).json()
  ).entries
  if (entries.length > 0) {
    await kyle.post("/api/plan/entries/bulk", {
      ids: entries.map((entry: { id: string }) => entry.id),
      action: "remove",
    })
  }
  await kyle.post("/api/pantry/clear")
})

describe("making a recipe", () => {
  test("sets when it was last made, without keeping a version", async () => {
    const before = Date.now()
    const soup = await made("soup")

    expect(new Date(soup.lastMadeAt).getTime()).toBeGreaterThanOrEqual(
      before - 1000
    )
    const versions = await (await kyle.get("/api/recipes/soup/versions")).json()
    expect(versions).toEqual([])
  })

  test("needs a recipe that's there", async () => {
    expect((await kyle.post("/api/recipes/no-such-recipe/made")).status).toBe(
      404
    )
  })
})

describe("making a recipe off the plan", () => {
  test("adds it to today, cooked, with the servings cooked", async () => {
    const recipe = await made("lemon-chicken", { servings: 2 })
    const [meal] = await mealsToday()

    expect(recipe.meal).toBe(meal!.id)
    expect(meal).toMatchObject({
      date: today,
      anyDay: false,
      status: "cooked",
      servings: 2,
      recipe: { id: recipe.id },
    })
    expect(MEALS).toContain(meal!.meal)
    expect(recipe.lastMadeAt).not.toBeNull()
  })

  test("takes from the pantry, and marking it not cooked puts it back", async () => {
    await kyle.post("/api/pantry/items", { text: "3 lb chicken thighs" })
    const recipe = await made("lemon-chicken", { servings: 2 })
    expect(await chicken()).toMatchObject({ amount: "2 lb" })

    await kyle.patch(`/api/plan/entries/${recipe.meal}`, { status: "planned" })
    expect(await chicken()).toMatchObject({ amount: "3 lb" })
    const after = await (await kyle.get("/api/recipes/lemon-chicken")).json()
    expect(after.lastMadeAt).toBeNull()
  })

  test("cooks today's meal of it, or the week's pool's, before adding one", async () => {
    const planned = await (
      await kyle.post("/api/plan/entries", {
        date: today,
        meal: "lunch",
        recipe: "lemon-chicken",
      })
    ).json()
    expect((await made("lemon-chicken")).meal).toBe(planned.id)

    await kyle.delete(`/api/plan/entries/${planned.id}`)
    const pooled = await (
      await kyle.post("/api/plan/entries", {
        date: today,
        meal: "dinner",
        anyDay: true,
        recipe: "lemon-chicken",
      })
    ).json()
    expect((await made("lemon-chicken")).meal).toBe(pooled.id)
    expect(await mealsToday()).toMatchObject([
      { id: pooled.id, anyDay: false, status: "cooked" },
    ])
  })

  test("counts today's meal of it already cooked, rather than adding another", async () => {
    await kyle.post("/api/pantry/items", { text: "5 lb chicken thighs" })
    const first = await made("lemon-chicken")
    expect(await chicken()).toMatchObject({ amount: "3 lb" })

    const again = await made("lemon-chicken")
    expect(again.meal).toBe(first.meal)
    expect(await mealsToday()).toHaveLength(1)
    expect(await chicken()).toMatchObject({ amount: "3 lb" })
  })
})
