import { addDays, clockIn, dayOfWeek, weekStartOf } from "@merran/shared"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../../test/app.ts"

// A recipe onto the list without planning a day for it: it goes in the
// any-day meals of the week with tomorrow in it, or the meal of it planned
// already goes on the list, and the list follows that meal from then on. In
// a household on UTC whose week starts today, so today is never its last day.

/** The day of the week the household's week starts on: today's. */
const WEEK_STARTS = dayOfWeek(clockIn("UTC").today)

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
  servings: number | null
}

type Listed = {
  entry: Entry
  made: boolean
  undo: { entry: string; made: boolean; servings: number | null }
  added: number
  merged: number
  onHand: string[]
  inPantry: string[]
}

/** This week's first day, where the household is. */
const thisWeek = () => weekStartOf(clockIn("UTC").today, WEEK_STARTS)

async function add(body: Record<string, unknown>): Promise<Listed> {
  const res = await kyle.post("/api/list/recipes", body)
  expect(res.status, await res.clone().text()).toBe(201)
  return res.json()
}

async function undo(listed: Listed) {
  const res = await kyle.post("/api/list/recipes/undo", listed.undo)
  expect(res.status, await res.clone().text()).toBe(200)
}

async function plan(body: Record<string, unknown>): Promise<Entry> {
  const res = await kyle.post("/api/plan/entries", body)
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
    weekStartsOn: WEEK_STARTS,
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
    expect(done.made).toBe(true)
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
    // tomorrows, so the household's week is never UTC's, whenever this runs.
    const utc = clockIn("UTC")
    const timeZone = utc.hour < 10 ? "Pacific/Honolulu" : "Pacific/Kiritimati"
    const tomorrowThere = addDays(clockIn(timeZone).today, 1)
    const tomorrowUtc = addDays(utc.today, 1)
    const weekStartsOn = dayOfWeek(
      tomorrowThere > tomorrowUtc ? tomorrowThere : tomorrowUtc
    )
    await kyle.patch("/api/households/current", { timeZone, weekStartsOn })
    try {
      const done = await add({ recipe: "lemon-chicken" })

      expect(done.entry.date).toBe(weekStartOf(tomorrowThere, weekStartsOn))
      expect(done.entry.date).not.toBe(weekStartOf(tomorrowUtc, weekStartsOn))
    } finally {
      await kyle.patch("/api/households/current", {
        timeZone: "UTC",
        weekStartsOn: WEEK_STARTS,
      })
    }
  })

  test("on the week's last day, goes in next week's any-day meals", async () => {
    const tomorrow = addDays(clockIn("UTC").today, 1)
    await kyle.patch("/api/households/current", {
      weekStartsOn: dayOfWeek(tomorrow),
    })
    try {
      const done = await add({ recipe: "lemon-chicken" })

      expect(done.entry).toMatchObject({ anyDay: true, date: tomorrow })
    } finally {
      await kyle.patch("/api/households/current", {
        weekStartsOn: WEEK_STARTS,
      })
    }
  })

  test("on the week's last day, made tonight, stays in this week's any-day meals", async () => {
    const today = clockIn("UTC").today
    const weekStartsOn = dayOfWeek(addDays(today, 1))
    await kyle.patch("/api/households/current", { weekStartsOn })
    try {
      const done = await add({ recipe: "lemon-chicken", tonight: true })

      expect(done.entry).toMatchObject({
        anyDay: true,
        date: weekStartOf(today, weekStartsOn),
      })
    } finally {
      await kyle.patch("/api/households/current", {
        weekStartsOn: WEEK_STARTS,
      })
    }
  })

  test("lists the meal of it planned already, rather than making another", async () => {
    const pie = await plan({
      date: addDays(thisWeek(), 2),
      meal: "dinner",
      recipe: "lemon-chicken",
    })

    const done = await add({ recipe: "lemon-chicken" })

    expect(done.made).toBe(false)
    expect(done.entry).toMatchObject({ id: pie.id, anyDay: false })
    expect((await planned()).map((entry) => entry.id)).toEqual([pie.id])
    const chicken = await find("chicken thighs")
    expect(chicken).toMatchObject({ quantity: 2 })
    expect(chicken?.meals.map((meal) => meal.id)).toEqual([pie.id])
    // It's on the list now, so adding from the plan doesn't add it again.
    const fromPlan = await kyle.post("/api/list/from-plan", {
      from: clockIn("UTC").today,
      to: addDays(thisWeek(), 6),
    })
    expect((await fromPlan.json()).meals).toBe(0)
  })

  test("gives the planned meal the servings asked for, and Undo puts them back", async () => {
    const pie = await plan({
      date: addDays(thisWeek(), 2),
      meal: "dinner",
      recipe: "lemon-chicken",
    })

    const done = await add({ recipe: "lemon-chicken", servings: 8 })

    expect(done.entry).toMatchObject({ id: pie.id, servings: 8 })
    expect(await find("chicken thighs")).toMatchObject({ quantity: 4 })

    await undo(done)

    expect(await planned()).toMatchObject([{ id: pie.id, servings: null }])
    expect(await find("chicken thighs")).toBeUndefined()
    // Off the list again, so adding from the plan lists it.
    const fromPlan = await kyle.post("/api/list/from-plan", {
      from: clockIn("UTC").today,
      to: addDays(thisWeek(), 6),
    })
    expect((await fromPlan.json()).meals).toBe(1)
  })

  test("leaves meals on the list or skipped alone", async () => {
    const today = clockIn("UTC").today
    await plan({ date: today, meal: "lunch", recipe: "lemon-chicken" })
    const skipped = await plan({
      date: addDays(today, 1),
      meal: "dinner",
      recipe: "lemon-chicken",
    })
    await kyle.patch(`/api/plan/entries/${skipped.id}`, { status: "skipped" })
    await kyle.post("/api/list/from-plan", { from: today, to: today })

    const done = await add({ recipe: "lemon-chicken" })

    expect(done.made).toBe(true)
    expect(done.entry.anyDay).toBe(true)
  })

  test("Undo takes a meal it made off the plan and the list", async () => {
    const done = await add({ recipe: "lemon-chicken" })

    await undo(done)

    expect(await planned()).toEqual([])
    expect(await list()).toEqual([])
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

    const post = (path: string, body: unknown) =>
      app.request(`${TEST_ORIGIN}/api${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      })

    const res = await post("/list/recipes", { recipe: ids["Lemon Chicken"] })
    expect(res.status, await res.clone().text()).toBe(201)

    // Undo too, though taking a meal off the plan otherwise needs the plan.
    const listed = (await res.json()) as Listed
    const undone = await post("/list/recipes/undo", listed.undo)
    expect(undone.status, await undone.clone().text()).toBe(200)
  })
})
