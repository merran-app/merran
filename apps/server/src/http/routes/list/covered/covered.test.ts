import { addDays, clockIn, weekStartOf } from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import { createTestApp, setUpServer, TestClient } from "../../../../test/app.ts"

// What's at home instead of on the list, in a US household on UTC whose
// week starts on Monday; and what goes back on the list when it isn't
// there after all.

let app: App
let close: () => Promise<void>
let kyle: TestClient
let monday: string
const ids: Record<string, string> = {}

type Covered = {
  items: {
    id: string
    name: string
    list: string
    amount: string
    meals: { id: string; name: string; date: string; amount: string }[]
    stillToBuy: string | null
  }[]
  onHand: string[]
}

type PantryItem = {
  id: string
  name: string
  amount: string
  meals: { id: string; onList: boolean; amount: string; short: string | null }[]
}

type ForMeals = {
  added: number
  merged: number
  before: unknown[]
  remove: string[]
  pantry: unknown[]
}

const day = (offset: number) => addDays(monday, offset)

async function covered(): Promise<Covered> {
  const res = await kyle.get("/api/list/covered")
  expect(res.status, await res.clone().text()).toBe(200)
  return res.json()
}

async function pantry(): Promise<PantryItem[]> {
  return (await (await kyle.get("/api/pantry")).json()).items
}

const atHome = async (name: string) =>
  (await pantry()).find((item) => item.name === name)

async function add(text: string) {
  const res = await kyle.post("/api/pantry/items", { text })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as PantryItem
}

async function plan(body: Record<string, unknown>) {
  const res = await kyle.post("/api/plan/entries", body)
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as { id: string }
}

async function fromPlan() {
  const res = await kyle.post("/api/list/from-plan", {
    from: day(0),
    to: day(6),
  })
  expect(res.status, await res.clone().text()).toBe(200)
}

async function listed(name: string) {
  const items = (await (await kyle.get("/api/list")).json()).items
  return items.find((item: { name: string }) => item.name === name) as
    { id: string; amount: string; meals: { name: string }[] } | undefined
}

async function forMeals(body: Record<string, unknown>): Promise<ForMeals> {
  const res = await kyle.post("/api/list/for-meals", body)
  expect(res.status, await res.clone().text()).toBe(200)
  return res.json()
}

/** Undo of putting things on the list: the list, then the pantry. */
async function undo(result: ForMeals) {
  const list = await kyle.post("/api/list/restore", {
    items: result.before,
    remove: result.remove,
  })
  expect(list.status, await list.clone().text()).toBe(200)
  if (result.pantry.length > 0) {
    const res = await kyle.post("/api/pantry/restore", {
      items: result.pantry,
    })
    expect(res.status, await res.clone().text()).toBe(200)
  }
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

/** Lemon Chicken on Monday, on the list. */
async function lemonChicken() {
  const meal = await plan({
    date: day(0),
    meal: "dinner",
    recipe: ids["Lemon Chicken"],
  })
  await fromPlan()
  return meal
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
  const today = clockIn("UTC").today
  monday = addDays(weekStartOf(today, 1), 7)
  for (const recipe of [
    {
      name: "Lemon Chicken",
      ingredients: [
        "2 lb chicken thighs",
        "2 lemons",
        "1 cup rice",
        "1 tsp salt",
      ],
    },
  ]) {
    const res = await kyle.post("/api/recipes", {
      servings: 4,
      steps: ["Cook it."],
      ...recipe,
    })
    ids[recipe.name] = (await res.json()).id
  }
})

afterAll(() => close())

describe("covered at home", () => {
  test("says what the list counted on, for which meals", async () => {
    await add("2 lb chicken thighs")
    const meal = await lemonChicken()
    expect(await listed("chicken thighs")).toBeUndefined()

    const { items, onHand } = await covered()
    expect(items).toMatchObject([
      {
        name: "chicken thighs",
        amount: "2 lb",
        meals: [
          { id: meal.id, name: "Lemon Chicken", date: day(0), amount: "2 lb" },
        ],
        stillToBuy: null,
      },
    ])
    expect(onHand).toEqual(["salt"])
    await clearAll()
  })

  test("and what's still to buy when it covers only part", async () => {
    await add("1 lb chicken thighs")
    await lemonChicken()
    expect((await covered()).items).toMatchObject([
      { name: "chicken thighs", amount: "1 lb", stillToBuy: "1 lb" },
    ])

    // The line's details say how much was at home for the meal.
    const line = await listed("chicken thighs")
    const details = await (
      await kyle.get(`/api/list/items/${line!.id}/details`)
    ).json()
    expect(details.meals).toMatchObject([
      { listedAmounts: ["1 lb"], atHome: ["1 lb"] },
    ])
    await clearAll()
  })

  test("not what was bought for the meals", async () => {
    await lemonChicken()
    const line = await listed("chicken thighs")
    await kyle.patch(`/api/list/items/${line!.id}`, { checked: true })
    await kyle.post("/api/list/put-away", {})
    expect((await atHome("chicken thighs"))?.meals).toHaveLength(1)
    expect((await covered()).items).toEqual([])
    await clearAll()
  })

  test("only for meals on the list still to come", async () => {
    await add("2 lb chicken thighs")
    const meal = await lemonChicken()
    await kyle.patch(`/api/plan/entries/${meal.id}`, { status: "skipped" })
    expect((await covered()).items).toEqual([])
    await clearAll()
  })

  test("counts on it again when a listed meal changes", async () => {
    await add("2 lb chicken thighs")
    const meal = await lemonChicken()
    await kyle.patch(`/api/plan/entries/${meal.id}`, { servings: 8 })
    expect((await covered()).items).toMatchObject([
      { name: "chicken thighs", amount: "2 lb", stillToBuy: "2 lb" },
    ])
    expect(await listed("chicken thighs")).toMatchObject({ amount: "2 lb" })
    await clearAll()
  })

  test("keeps what was counted on through cooking and its Undo", async () => {
    await add("2 lb chicken thighs")
    const meal = await lemonChicken()
    await kyle.patch(`/api/plan/entries/${meal.id}`, { status: "cooked" })
    expect(await atHome("chicken thighs")).toBeUndefined()
    expect((await covered()).items).toEqual([])

    await kyle.patch(`/api/plan/entries/${meal.id}`, { status: "planned" })
    expect((await covered()).items).toMatchObject([
      { name: "chicken thighs", amount: "2 lb" },
    ])
    await clearAll()
  })
})

describe("not at home after all", () => {
  test("puts what the meals counted on on the list, with Undo", async () => {
    const chicken = await add("2 lb chicken thighs")
    await lemonChicken()

    const res = await kyle.post(
      `/api/list/covered/${chicken.id}/not-at-home`,
      {}
    )
    expect(res.status, await res.clone().text()).toBe(200)
    const result = (await res.json()) as ForMeals
    expect(result).toMatchObject({ added: 1, merged: 0 })
    expect(await listed("chicken thighs")).toMatchObject({
      amount: "2 lb",
      meals: [{ name: "Lemon Chicken" }],
    })
    expect(await atHome("chicken thighs")).toBeUndefined()
    expect((await covered()).items).toEqual([])

    await undo(result)
    expect(await listed("chicken thighs")).toBeUndefined()
    expect((await covered()).items).toMatchObject([
      { name: "chicken thighs", amount: "2 lb" },
    ])
    await clearAll()
  })

  test("isn't found for something not in the pantry", async () => {
    const res = await kyle.post(
      `/api/list/covered/${crypto.randomUUID()}/not-at-home`,
      {}
    )
    expect(res.status).toBe(404)
  })
})

describe("used up, then put on the list", () => {
  test("puts back what it was set aside for meals on the list", async () => {
    const chicken = await add("2 lb chicken thighs")
    const meal = await lemonChicken()
    expect((await atHome("chicken thighs"))?.meals).toMatchObject([
      { id: meal.id, onList: true, amount: "2 lb", short: null },
    ])

    const before = await (
      await kyle.delete(`/api/pantry/items/${chicken.id}`)
    ).json()
    const result = await forMeals({ removed: [before] })
    expect(result).toMatchObject({ added: 1, pantry: [] })
    expect(await listed("chicken thighs")).toMatchObject({
      amount: "2 lb",
      meals: [{ name: "Lemon Chicken" }],
    })

    // Undo takes it back off; the meal stays on the list.
    await undo(result)
    expect(await listed("chicken thighs")).toBeUndefined()
    await clearAll()
  })

  test("adds to what's on the list for it already", async () => {
    const chicken = await add("1 lb chicken thighs")
    await lemonChicken()
    const before = await (
      await kyle.delete(`/api/pantry/items/${chicken.id}`)
    ).json()
    const result = await forMeals({ removed: [before] })
    expect(result).toMatchObject({ added: 0, merged: 1, remove: [] })
    expect(await listed("chicken thighs")).toMatchObject({ amount: "2 lb" })

    await undo(result)
    expect(await listed("chicken thighs")).toMatchObject({ amount: "1 lb" })
    await clearAll()
  })

  test("but nothing for a meal that isn't on the list", async () => {
    const chicken = await add("2 lb chicken thighs")
    const meal = await lemonChicken()
    await kyle.patch(`/api/plan/entries/${meal.id}`, { status: "skipped" })
    expect((await atHome("chicken thighs"))?.meals).toMatchObject([
      { onList: false },
    ])
    const before = await (
      await kyle.delete(`/api/pantry/items/${chicken.id}`)
    ).json()
    expect(await forMeals({ removed: [before] })).toMatchObject({
      added: 0,
      merged: 0,
    })
    expect(await listed("chicken thighs")).toBeUndefined()
    await clearAll()
  })
})

describe("less at home than set aside", () => {
  test("says what's short, and puts it on the list, with Undo", async () => {
    const chicken = await add("2 lb chicken thighs")
    await lemonChicken()
    const changed = await (
      await kyle.patch(`/api/pantry/items/${chicken.id}`, { amount: "1 lb" })
    ).json()
    expect(changed.meals).toMatchObject([{ amount: "2 lb", short: "1 lb" }])

    const result = await forMeals({ items: [chicken.id] })
    expect(result).toMatchObject({ added: 1, pantry: [{ id: chicken.id }] })
    expect(await listed("chicken thighs")).toMatchObject({ amount: "1 lb" })
    // What isn't there stops being set aside, and counted on.
    expect((await atHome("chicken thighs"))?.meals).toMatchObject([
      { amount: "1 lb", short: null },
    ])
    expect((await covered()).items).toMatchObject([
      { amount: "1 lb", stillToBuy: "1 lb" },
    ])

    await undo(result)
    expect(await listed("chicken thighs")).toBeUndefined()
    expect((await atHome("chicken thighs"))?.meals).toMatchObject([
      { amount: "2 lb", short: "1 lb" },
    ])
    await clearAll()
  })

  test("adding up what's still to buy for the meal", async () => {
    const chicken = await add("1 lb chicken thighs")
    await lemonChicken()
    await kyle.patch(`/api/pantry/items/${chicken.id}`, { amount: "½ lb" })
    await forMeals({ items: [chicken.id] })
    expect(await listed("chicken thighs")).toMatchObject({ amount: "1 ½ lb" })
    expect((await covered()).items).toMatchObject([
      { amount: "½ lb", stillToBuy: "1 ½ lb" },
    ])
    await clearAll()
  })

  test("and nothing when there's enough", async () => {
    const chicken = await add("2 lb chicken thighs")
    await lemonChicken()
    expect(await forMeals({ items: [chicken.id] })).toMatchObject({
      added: 0,
      merged: 0,
      pantry: [],
    })
    await clearAll()
  })

  test("needs something to put on the list", async () => {
    const res = await kyle.post("/api/list/for-meals", {})
    expect(res.status).toBe(400)
  })
})
