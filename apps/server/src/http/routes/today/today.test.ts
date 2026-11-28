import { addDays, clockIn, weekStartOf } from "@merran/shared"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { Recipe } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { forHousehold } from "../../../database/scope.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../test/app.ts"

// What Today shows at a glance, in a US household on UTC whose week starts
// on Monday.

let app: App
let database: Database
let close: () => Promise<void>
let kyle: TestClient
let householdId: string
/** Next week's Monday, so meals are still to come. */
let monday: string
const ids: Record<string, string> = {}

type Today = {
  list: { toBuy: number; names: string[]; meals: string[] } | null
  pantry: {
    useSoon: { name: string; useSoon: { kind: string } }[]
    meals: { id: string; names: string[] }[]
  } | null
  recipes: {
    total: number
    recent: { name: string }[]
    cookAgain: { name: string }[]
  } | null
}

const day = (offset: number) => addDays(monday, offset)

async function today(): Promise<Today> {
  const res = await kyle.get("/api/today")
  expect(res.status, await res.clone().text()).toBe(200)
  return res.json()
}

async function createRecipe(name: string, ingredients: string[]) {
  const res = await kyle.post("/api/recipes", {
    name,
    servings: 4,
    steps: ["Cook it."],
    ingredients,
  })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()).id as string
}

async function plan(body: Record<string, unknown>) {
  const res = await kyle.post("/api/plan/entries", body)
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as { id: string }
}

async function add(text: string) {
  const res = await kyle.post("/api/pantry/items", { text })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as { id: string }
}

async function useBy(id: string, date: string) {
  const res = await kyle.patch(`/api/pantry/items/${id}`, { useBy: date })
  expect(res.status, await res.clone().text()).toBe(200)
}

async function fromPlan() {
  const res = await kyle.post("/api/list/from-plan", {
    from: day(0),
    to: day(6),
  })
  expect(res.status, await res.clone().text()).toBe(200)
}

/** Meals first: taking a cooked one off puts back what it used. */
async function clearAll() {
  const entries = (
    await (await kyle.get(`/api/plan?from=${day(-14)}&to=${day(13)}`)).json()
  ).entries
  if (entries.length > 0) {
    await kyle.post("/api/plan/entries/bulk", {
      ids: entries.map((entry: { id: string }) => entry.id),
      action: "remove",
    })
  }
  await kyle.post("/api/pantry/clear")
  await kyle.post("/api/list/clear", { which: "all" })
}

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, database, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  await kyle.patch("/api/households/current", {
    timeZone: "UTC",
    weekStartsOn: 1,
    country: "US",
  })
  householdId = (await (await kyle.get("/api/households/current")).json()).id
  monday = addDays(weekStartOf(clockIn("UTC").today, 1), 7)
  ids["Lemon Chicken"] = await createRecipe("Lemon Chicken", [
    "2 lb chicken thighs",
    "2 lemons",
    "1 cup rice",
  ])
  ids["Spinach Frittata"] = await createRecipe("Spinach Frittata", [
    "2 cups spinach",
    "4 eggs",
  ])
})

afterAll(() => close())

afterEach(() => clearAll())

describe("Today at a glance", () => {
  test("counts what's left to buy and names the first three", async () => {
    for (const text of ["milk", "bread", "eggs", "butter"]) {
      await kyle.post("/api/list/items", { text })
    }
    const items = (await (await kyle.get("/api/list")).json()).items as {
      id: string
      name: string
    }[]
    // Checked off, so it isn't left to buy.
    const checked = items.find((item) => item.name === "bread")!
    await kyle.patch(`/api/list/items/${checked.id}`, { checked: true })

    const { list } = await today()
    const unchecked = items
      .filter((item) => item.name !== "bread")
      .map((item) => item.name)
    expect(list?.toBuy).toBe(3)
    expect(list?.names).toEqual(unchecked.slice(0, 3))
    expect(list?.meals).toEqual([])
  })

  test("says which meals are on the list, and what's home for them", async () => {
    await add("2 lb chicken thighs")
    const meal = await plan({
      date: day(0),
      meal: "dinner",
      recipe: ids["Lemon Chicken"],
    })
    await fromPlan()

    const summary = await today()
    expect(summary.list?.meals).toEqual([meal.id])
    expect(summary.pantry?.meals).toEqual([
      { id: meal.id, names: ["chicken thighs"] },
    ])
  })

  test("puts what to use soon most urgent first", async () => {
    // Spinach and eggs bought for a meal that was skipped are leftovers.
    const frittata = await plan({
      date: day(0),
      meal: "dinner",
      recipe: ids["Spinach Frittata"],
    })
    await fromPlan()
    const list = (await (await kyle.get("/api/list")).json()).items
    await kyle.post("/api/list/items/bulk", {
      ids: list.map((item: { id: string }) => item.id),
      action: "check",
    })
    await kyle.post("/api/list/put-away", {})
    await kyle.patch(`/api/plan/entries/${frittata.id}`, { status: "skipped" })

    const tomorrow = await add("milk")
    await useBy(tomorrow.id, addDays(clockIn("UTC").today, 1))
    const gone = await add("yogurt")
    await useBy(gone.id, addDays(clockIn("UTC").today, -1))

    const { pantry } = await today()
    expect(
      pantry?.useSoon.map((item) => [item.name, item.useSoon.kind])
    ).toEqual([
      ["yogurt", "past"],
      ["milk", "soon"],
      // As urgent as each other, so in the pantry's order.
      ["spinach", "leftover"],
      ["eggs", "leftover"],
    ])
  })

  test("picks recipes to cook again as Today did", async () => {
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)
    const em = forHousehold(database.em, householdId)
    const rated = async (
      name: string,
      rating: number,
      madeDaysAgo: number | null
    ) => {
      const id = await createRecipe(name, ["1 cup rice"])
      await em.nativeUpdate(
        Recipe,
        { id },
        {
          rating,
          lastMadeAt: madeDaysAgo === null ? null : daysAgo(madeDaysAgo),
        }
      )
    }
    await rated("Made a month ago", 5, 30)
    await rated("Never made", 4, null)
    await rated("Made this week", 5, 3)
    await rated("Not a favorite", 3, null)

    const { recipes } = await today()
    expect(recipes?.cookAgain.map((recipe) => recipe.name)).toEqual([
      "Made a month ago",
      "Never made",
    ])
    const newest = (await (await kyle.get("/api/recipes?limit=6")).json())
      .recipes as { name: string }[]
    expect(recipes?.recent.map((recipe) => recipe.name)).toEqual(
      newest.map((recipe) => recipe.name)
    )
    expect(recipes?.recent).toHaveLength(6)
    // Lemon Chicken, Spinach Frittata, and the four above.
    expect(recipes?.total).toBe(6)
  })

  test("gives a key only what it can read", async () => {
    const key = (
      await (
        await kyle.post("/api/auth/api-keys", {
          name: "Recipes screen",
          permissions: { recipes: "read" },
          expiresInDays: 30,
        })
      ).json()
    ).key
    await kyle.post("/api/list/items", { text: "milk" })
    await add("rice")

    const res = await app.request(`${TEST_ORIGIN}/api/today`, {
      headers: new Headers({ authorization: `Bearer ${key}` }),
    })
    expect(res.status, await res.clone().text()).toBe(200)
    const body = (await res.json()) as Today
    expect(body.list).toBeNull()
    expect(body.pantry).toBeNull()
    expect(body.recipes?.total).toBeGreaterThan(0)
  })

  test("refuses a key that can read none of what Today shows", async () => {
    const key = (
      await (
        await kyle.post("/api/auth/api-keys", {
          name: "Plan only",
          permissions: { plan: "read" },
          expiresInDays: 30,
        })
      ).json()
    ).key

    const res = await app.request(`${TEST_ORIGIN}/api/today`, {
      headers: new Headers({ authorization: `Bearer ${key}` }),
    })
    expect(res.status, await res.clone().text()).toBe(403)
  })

  test("is only the household's own", async () => {
    const before = await today()

    // Sam is in another household, the Cabin, with things of its own.
    await kyle.post("/api/households", { name: "Cabin" })
    const sam = await join(app, await inviteToken(kyle), account("sam", "Sam"))
    await kyle.post("/api/auth/organization/set-active", {
      organizationId: householdId,
    })
    await sam.post("/api/list/items", { text: "firewood" })
    await sam.post("/api/pantry/items", { text: "marshmallows" })
    await sam.post("/api/recipes", {
      name: "Campfire Chili",
      servings: 4,
      steps: ["Cook it."],
      ingredients: ["1 can beans"],
    })

    expect(await today()).toEqual(before)
    const theirs = (await (await sam.get("/api/today")).json()) as Today
    expect(theirs.list?.names).toEqual(["firewood"])
    expect(theirs.recipes?.total).toBe(1)
  })
})
