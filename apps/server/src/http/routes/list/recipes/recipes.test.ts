import { addDays, clockIn, dayOfWeek, weekStartOf } from "@merran/shared"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../../test/app.ts"

// A recipe onto the list without planning a day for it: it goes in this
// week's any-day meals, and the list follows that meal from then on. In a
// household on UTC whose week starts on Monday.

let app: App
let close: () => Promise<void>
let kyle: TestClient
const ids: Record<string, string> = {}

type Item = {
  id: string
  name: string
  quantity: number | null
  unit: string | null
  checked: boolean
  meals: { id: string; name: string }[]
}

type Entry = {
  id: string
  date: string
  anyDay: boolean
  meal: string
  status: string
}

type Listed = {
  entry: Entry
  added: number
  merged: number
  onHand: string[]
  inPantry: string[]
}

/** This week's first day, where the household is. */
const thisWeek = (timeZone = "UTC") => weekStartOf(clockIn(timeZone).today, 1)

async function add(body: Record<string, unknown>): Promise<Listed> {
  const res = await kyle.post("/api/list/recipes", body)
  expect(res.status, await res.clone().text()).toBe(201)
  return res.json()
}

async function list(): Promise<Item[]> {
  const res = await kyle.get("/api/list")
  expect(res.status).toBe(200)
  return (await res.json()).items
}

const find = async (name: string) =>
  (await list()).find((item) => item.name === name && !item.checked)

async function planned(): Promise<Entry[]> {
  const from = addDays(thisWeek(), -7)
  const to = addDays(thisWeek(), 13)
  const res = await kyle.get(`/api/plan?from=${from}&to=${to}`)
  return (await res.json()).entries
}

/** The list, the plan and the pantry, emptied. */
async function clearAll() {
  await kyle.post("/api/list/clear", { which: "all" })
  await kyle.post("/api/pantry/clear")
  const entries = await planned()
  if (entries.length > 0) {
    await kyle.post("/api/plan/entries/bulk", {
      ids: entries.map((entry) => entry.id),
      action: "remove",
    })
  }
}

const RECIPES = [
  {
    name: "Lemon Chicken",
    ingredients: [
      "2 lb chicken thighs",
      "2 lemons",
      "1 tbsp olive oil",
      "Salt to taste",
      "1/2 cup chicken stock",
    ],
  },
  {
    name: "Garlic Rice",
    ingredients: ["1 cup rice", "2 cloves garlic", "1 tbsp olive oil"],
  },
  {
    name: "Beef Tacos",
    ingredients: ["1 lb ground beef", "8 corn tortillas", "2 limes"],
  },
]

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  await kyle.patch("/api/households/current", {
    timeZone: "UTC",
    weekStartsOn: 1,
    country: "GB",
  })
  for (const recipe of RECIPES) {
    const res = await kyle.post("/api/recipes", {
      servings: 4,
      steps: ["Cook it."],
      ...recipe,
    })
    ids[recipe.name] = (await res.json()).id
  }
})

afterAll(() => close())

beforeEach(() => clearAll())

describe("adding a recipe to the list", () => {
  test("puts the recipe in this week's any-day meals, and its ingredients on the list", async () => {
    const done = await add({ recipe: "lemon-chicken" })

    expect(done.entry).toMatchObject({
      anyDay: true,
      meal: "dinner",
      date: thisWeek(),
      status: "planned",
    })
    expect(done.added).toBeGreaterThan(0)
    const chicken = await find("chicken thighs")
    expect(chicken?.meals.map((meal) => meal.id)).toContain(done.entry.id)
    expect((await planned()).map((entry) => entry.id)).toContain(done.entry.id)
  })

  test("leaves off what's always on hand, and every-week items", async () => {
    const bananas = await (
      await kyle.post("/api/list/every-week", { name: "Bananas" })
    ).json()

    const done = await add({ recipe: "lemon-chicken" })

    expect(done.onHand).toContain("salt")
    const names = (await list()).map((item) => item.name)
    expect(names).not.toContain("salt")
    expect(names).not.toContain("Bananas")
    await kyle.delete(`/api/list/every-week/${bananas.id}`)
  })

  test("counts on what's at home", async () => {
    await kyle.post("/api/pantry/items", { text: "2 lb chicken thighs" })

    const done = await add({ recipe: "lemon-chicken" })

    expect(done.inPantry).toContain("chicken thighs")
    expect(await find("chicken thighs")).toBeUndefined()
  })

  test("adds the side and the servings asked for", async () => {
    await add({
      recipe: "lemon-chicken",
      withRecipe: "garlic-rice",
      servings: 8,
    })

    expect(await find("chicken thighs")).toMatchObject({
      quantity: 4,
      unit: "pound",
    })
    expect(await find("rice")).toBeDefined()
  })

  test("adds up with what's on the list already", async () => {
    await kyle.post("/api/list/items", { text: "1 lb chicken thighs" })

    const done = await add({ recipe: "lemon-chicken" })

    expect(done.merged).toBeGreaterThanOrEqual(1)
    const chicken = (await list()).filter(
      (item) => item.name === "chicken thighs"
    )
    expect(chicken).toHaveLength(1)
    expect(chicken[0]).toMatchObject({ quantity: 3, unit: "pound" })
  })

  test("the same recipe twice is two meals, and Undo takes off only the second", async () => {
    const first = await add({ recipe: "lemon-chicken" })
    const second = await add({ recipe: "lemon-chicken" })

    expect(second.entry.id).not.toBe(first.entry.id)
    expect(await find("chicken thighs")).toMatchObject({ quantity: 4 })

    const res = await kyle.delete(`/api/plan/entries/${second.entry.id}`)
    expect(res.status).toBe(200)

    const chicken = await find("chicken thighs")
    expect(chicken).toMatchObject({ quantity: 2 })
    expect(chicken?.meals.map((meal) => meal.id)).toEqual([first.entry.id])
  })

  test("takes a meal type the household plans", async () => {
    await kyle.patch("/api/households/current", {
      meals: ["breakfast", "lunch"],
    })
    try {
      expect((await add({ recipe: "lemon-chicken" })).entry.meal).toBe(
        "breakfast"
      )
      expect(
        (await add({ recipe: "lemon-chicken", meal: "lunch" })).entry.meal
      ).toBe("lunch")
    } finally {
      await kyle.patch("/api/households/current", {
        meals: ["breakfast", "lunch", "dinner"],
      })
    }
  })

  test("uses the household's week where it is", async () => {
    // A day behind UTC (Honolulu, before 10:00 UTC) or a day ahead
    // (Kiritimati, after), with the week starting on the later of the two
    // days, so the household's week is never UTC's, whenever this runs.
    const utc = clockIn("UTC")
    const timeZone = utc.hour < 10 ? "Pacific/Honolulu" : "Pacific/Kiritimati"
    const there = clockIn(timeZone).today
    const weekStartsOn = dayOfWeek(there > utc.today ? there : utc.today)
    await kyle.patch("/api/households/current", { timeZone, weekStartsOn })
    try {
      const done = await add({ recipe: "lemon-chicken" })

      expect(done.entry.date).toBe(weekStartOf(there, weekStartsOn))
      expect(done.entry.date).not.toBe(weekStartOf(utc.today, weekStartsOn))
    } finally {
      await kyle.patch("/api/households/current", {
        timeZone: "UTC",
        weekStartsOn: 1,
      })
    }
  })

  test("turns away a recipe that's gone", async () => {
    await kyle.delete("/api/recipes/beef-tacos")

    const res = await kyle.post("/api/list/recipes", {
      recipe: ids["Beef Tacos"],
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({
      error: { code: "recipe_not_found" },
    })
    expect(await planned()).toEqual([])
    expect(await list()).toEqual([])
  })

  test("works with a key that can only write the list", async () => {
    const key = (
      await (
        await kyle.post("/api/auth/api-keys", {
          name: "List only",
          permissions: { list: "write" },
          expiresInDays: 30,
        })
      ).json()
    ).key

    const res = await app.request(`${TEST_ORIGIN}/api/list/recipes`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ recipe: ids["Lemon Chicken"] }),
    })

    expect(res.status, await res.clone().text()).toBe(201)
  })
})
