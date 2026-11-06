import { addDays, clockIn, weekStartOf } from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import {
  FoodPlacement,
  Household,
  Purchase,
  RecipeIngredient,
  ShoppingItem,
} from "../../../../database/entities/index.ts"
import type { Database } from "../../../../database/orm.ts"
import { forHousehold } from "../../../../database/scope.ts"
import { createTestApp, setUpServer, TestClient } from "../../../../test/app.ts"

// Checking food off the list puts it in the pantry, in a US household on UTC
// whose week starts on Monday.

let app: App
let database: Database
let close: () => Promise<void>
let kyle: TestClient
let householdId: string
let today: string
/** Next week's Monday, so meals are still to come. */
let monday: string
const ids: Record<string, string> = {}

type PantryItem = {
  id: string
  name: string
  amount: string
  quantity: number | null
  unit: string | null
  storedIn: string | null
  useBy: string | null
  meals: { id: string; name: string }[]
}

type ListItem = {
  id: string
  name: string
  checked: boolean
}

const day = (offset: number) => addDays(monday, offset)

async function pantry(): Promise<PantryItem[]> {
  const res = await kyle.get("/api/pantry")
  expect(res.status).toBe(200)
  return (await res.json()).items
}

const find = async (name: string) =>
  (await pantry()).find((item) => item.name === name)

/** Types something into the pantry, as its add box does. */
async function add(text: string) {
  const res = await kyle.post("/api/pantry/items", { text })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as PantryItem
}

async function listItems() {
  const res = await kyle.get("/api/list")
  expect(res.status).toBe(200)
  return (await res.json()).items as ListItem[]
}

/** Types a line onto the list, as the add box does. */
async function typed(text: string): Promise<ListItem> {
  const res = await kyle.post("/api/list/items", { text })
  expect(res.status, await res.clone().text()).toBe(201)
  return res.json()
}

/** Checks a row off, or not, as tapping it does. */
async function check(row: { id: string }, on: boolean) {
  const res = await kyle.patch(`/api/list/items/${row.id}`, { checked: on })
  expect(res.status, await res.clone().text()).toBe(200)
  return (await res.json()) as ListItem
}

/** What's in the purchase history, by name. */
async function purchases() {
  const em = forHousehold(database.em.fork(), householdId)
  const bought = await em.find(Purchase, {}, { orderBy: { name: "asc" } })
  return bought.map((purchase) => purchase.name)
}

/** What checking a row off put away, as the row remembers it. */
async function putAwayOf(row: { id: string }) {
  const em = forHousehold(database.em.fork(), householdId)
  return (await em.findOneOrFail(ShoppingItem, { id: row.id })).putAway
}

async function plan(body: Record<string, unknown>) {
  const res = await kyle.post("/api/plan/entries", body)
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as { id: string }
}

/** Puts next week's meals on the list. */
async function fromPlan() {
  const res = await kyle.post("/api/list/from-plan", {
    from: day(0),
    to: day(6),
  })
  expect(res.status, await res.clone().text()).toBe(200)
}

async function setting(on: boolean) {
  const res = await kyle.patch("/api/households/current", {
    putAwayWhenChecked: on,
  })
  expect(res.status, await res.clone().text()).toBe(200)
  return res.json()
}

/**
 * Checks rows off as a household from before the setting did: it has the
 * setting on with nothing saved, and what it checked off never went
 * through turning it on, so none of it is in the pantry.
 */
async function checkedBeforeTheSetting(rows: readonly ListItem[]) {
  await setting(false)
  try {
    for (const row of rows) await check(row, true)
    const em = database.em.fork()
    const household = await em.findOneOrFail(Household, householdId)
    const { pantry: _saved, ...settings } = household.settings ?? {}
    household.settings = settings
    await em.flush()
  } finally {
    await setting(true)
  }
  for (const row of rows) expect(await putAwayOf(row)).toBeNull()
}

/** Splits off a second list, so the page clears by taking rows off. */
async function secondList() {
  const { lists } = await (await kyle.get("/api/list")).json()
  const res = await kyle.put("/api/list/lists", {
    lists: [
      { id: lists[0].id, name: lists[0].name, aisles: [] },
      { name: "Costco", aisles: [] },
    ],
  })
  expect(res.status, await res.clone().text()).toBe(200)
  const saved = (await res.json()).lists as { id: string; name: string }[]
  return saved.find((list) => list.name === "Costco")!.id
}

/** Back to the one list. */
async function oneList() {
  const { lists } = await (await kyle.get("/api/list")).json()
  const main = lists[0]
  const res = await kyle.put("/api/list/lists", {
    lists: [{ id: main.id, name: main.name, aisles: [] }],
  })
  expect(res.status, await res.clone().text()).toBe(200)
}

/** The pantry, the list, the plan and the purchase history, emptied. */
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
  // The list first: clearing it puts checked rows away.
  await kyle.post("/api/list/clear", { which: "all" })
  await kyle.post("/api/pantry/clear")
  // Nothing takes purchases out of the history but unchecking, so the
  // tests start each other clean straight from the database.
  const em = forHousehold(database.em.fork(), householdId)
  await em.nativeDelete(Purchase, {})
  // And moving things taught where they go: forget that too.
  await em.nativeDelete(FoodPlacement, {})
}

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, database, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  householdId = (
    await (
      await kyle.patch("/api/households/current", {
        timeZone: "UTC",
        weekStartsOn: 1,
        country: "US",
      })
    ).json()
  ).id
  today = clockIn("UTC").today
  monday = addDays(weekStartOf(today, 1), 7)
  const res = await kyle.post("/api/recipes", {
    name: "Lemon Chicken",
    servings: 4,
    steps: ["Cook it."],
    ingredients: ["2 lb chicken thighs", "2 lemons", "1 cup rice"],
  })
  ids["Lemon Chicken"] = (await res.json()).id
})

afterAll(() => close())

describe("putting food away when it's checked off", () => {
  test("puts food away when it's checked off, unless the household says not", async () => {
    const household = await (await kyle.get("/api/households/current")).json()
    expect(household.putAwayWhenChecked).toBe(true)
    const off = await kyle.patch("/api/households/current", {
      putAwayWhenChecked: false,
    })
    expect((await off.json()).putAwayWhenChecked).toBe(false)
    await setting(true)
  })
})

describe("checking off", () => {
  test("puts it in the pantry, set aside for its meal, and records the purchase", async () => {
    const meal = await plan({
      date: day(0),
      meal: "dinner",
      recipe: ids["Lemon Chicken"],
    })
    await fromPlan()
    const chicken = (await listItems()).find(
      (item) => item.name === "chicken thighs"
    )!
    await check(chicken, true)
    expect(await find("chicken thighs")).toMatchObject({
      amount: "2 lb",
      storedIn: "fridge",
      useBy: addDays(today, 3),
      meals: [{ id: meal.id, name: "Lemon Chicken" }],
    })
    expect(await purchases()).toEqual(["chicken thighs"])
    await clearAll()
  })

  test("unchecking takes exactly that back out of stock that was there", async () => {
    await add("1 lb chicken thighs")
    const row = await typed("2 lb chicken thighs")
    await check(row, true)
    expect(await pantry()).toMatchObject([
      { name: "chicken thighs", amount: "3 lb" },
    ])
    await check(row, false)
    expect(await pantry()).toMatchObject([
      { name: "chicken thighs", amount: "1 lb" },
    ])
    expect(await purchases()).toEqual([])
    await clearAll()
  })

  test("unchecking takes its meal's share off what stays at home", async () => {
    const meal = await plan({
      date: day(0),
      meal: "dinner",
      recipe: ids["Lemon Chicken"],
    })
    await fromPlan()
    await add("1 lb chicken thighs")
    const row = (await listItems()).find(
      (item) => item.name === "chicken thighs"
    )!
    await check(row, true)
    expect(await find("chicken thighs")).toMatchObject({
      amount: "3 lb",
      meals: [{ id: meal.id }],
    })
    await check(row, false)
    expect(await find("chicken thighs")).toMatchObject({
      amount: "1 lb",
      meals: [],
    })
    await clearAll()
  })

  test("unchecking what made a pantry item takes the item away", async () => {
    const row = await typed("1 gallon milk")
    await check(row, true)
    expect(await find("milk")).toBeDefined()
    await check(row, false)
    expect(await find("milk")).toBeUndefined()
    await clearAll()
  })

  test("something with no amount goes in as having some, and comes out only if it made it", async () => {
    const basil = await typed("basil")
    await check(basil, true)
    expect(await find("basil")).toMatchObject({ amount: "" })
    await check(basil, false)
    expect(await find("basil")).toBeUndefined()
    await add("rice")
    const rice = await typed("rice")
    await check(rice, true)
    await check(rice, false)
    expect(await find("rice")).toMatchObject({ amount: "" })
    await clearAll()
  })

  test("something with an amount in words comes out only if it made it", async () => {
    const spinach = await typed("spinach")
    await kyle.patch(`/api/list/items/${spinach.id}`, { amount: "half a bag" })
    await check(spinach, true)
    expect(await find("spinach")).toMatchObject({ amount: "half a bag" })
    await check(spinach, false)
    expect(await find("spinach")).toBeUndefined()
    expect(await purchases()).toEqual([])
    await clearAll()
  })

  test("unchecking what gave an amount to something there as having some leaves it as that", async () => {
    await add("rice")
    const row = await typed("2 lb rice")
    await check(row, true)
    expect(await find("rice")).toMatchObject({ amount: "2 lb" })
    await check(row, false)
    expect(await find("rice")).toMatchObject({ amount: "" })
    expect(await purchases()).toEqual([])
    await clearAll()
  })

  test("unchecking what gave an amount in words to something there as having some leaves it as that, unless it's changed since", async () => {
    await add("flour")
    const flour = await typed("flour")
    await kyle.patch(`/api/list/items/${flour.id}`, { amount: "half a bag" })
    await check(flour, true)
    expect(await find("flour")).toMatchObject({ amount: "half a bag" })
    await check(flour, false)
    expect(await find("flour")).toMatchObject({ amount: "" })

    // Changed at home since it went in, it's left as it is now.
    await add("sugar")
    const sugar = await typed("sugar")
    await kyle.patch(`/api/list/items/${sugar.id}`, { amount: "half a bag" })
    await check(sugar, true)
    const stored = (await find("sugar"))!
    const changed = await kyle.patch(`/api/pantry/items/${stored.id}`, {
      amount: "a little",
    })
    expect(changed.status, await changed.clone().text()).toBe(200)
    await check(sugar, false)
    expect(await find("sugar")).toMatchObject({ amount: "a little" })
    expect(await purchases()).toEqual([])
    await clearAll()
  })

  test("household things and staples are bought, not stored", async () => {
    const towels = await typed("paper towels")
    const salt = await typed("salt")
    await check(towels, true)
    await check(salt, true)
    expect(await pantry()).toEqual([])
    expect(await purchases()).toEqual(["paper towels", "salt"])
    await check(towels, false)
    await check(salt, false)
    expect(await pantry()).toEqual([])
    expect(await purchases()).toEqual([])
    await clearAll()
  })

  test("a selection goes in, and its Undo takes it back out", async () => {
    const milk = await typed("1 gallon milk")
    const eggs = await typed("12 eggs")
    const res = await kyle.post("/api/list/items/bulk", {
      ids: [milk.id, eggs.id],
      action: "check",
    })
    expect(res.status, await res.clone().text()).toBe(200)
    const { before } = await res.json()
    expect(await find("milk")).toBeDefined()
    expect(await find("eggs")).toBeDefined()

    const undo = await kyle.post("/api/list/restore", { items: before })
    expect(undo.status, await undo.clone().text()).toBe(200)
    expect(await find("milk")).toBeUndefined()
    expect(await find("eggs")).toBeUndefined()
    expect(await listItems()).toMatchObject([
      { name: "milk", checked: false },
      { name: "eggs", checked: false },
    ])
    expect(await purchases()).toEqual([])
    await clearAll()
  })

  test("a row put back saying it put another food away takes none of that out", async () => {
    const chicken = await typed("2 lb chicken thighs")
    await check(chicken, true)
    const record = await putAwayOf(chicken)
    expect(record).toMatchObject({ quantity: 2, created: true })

    // Milk, taken off the list and put back checked, claiming the chicken.
    const milk = await typed("1 gallon milk")
    const removed = await kyle.delete(`/api/list/items/${milk.id}`)
    expect(removed.status, await removed.clone().text()).toBe(200)
    const snapshot = await removed.json()
    const restored = await kyle.post("/api/list/restore", {
      items: [{ ...snapshot, checked: true, putAway: record }],
    })
    expect(restored.status, await restored.clone().text()).toBe(200)
    await check(milk, false)

    expect(await find("chicken thighs")).toMatchObject({ amount: "2 lb" })
    expect(await purchases()).toEqual(["chicken thighs"])
    await clearAll()
  })

  test("two phones checking the same row at once put it away once", async () => {
    const row = await typed("2 lb chicken thighs")
    await Promise.all([check(row, true), check(row, true)])
    expect(await find("chicken thighs")).toMatchObject({ amount: "2 lb" })
    expect(await purchases()).toEqual(["chicken thighs"])
    await clearAll()
  })
})

describe("a checked row", () => {
  test("changing its amount changes what went in", async () => {
    const row = await typed("2 lb chicken thighs")
    await check(row, true)
    await kyle.patch(`/api/list/items/${row.id}`, { amount: "3 lb" })
    expect(await find("chicken thighs")).toMatchObject({ amount: "3 lb" })
    expect(await purchases()).toEqual(["chicken thighs"])
    await check(row, false)
    expect(await find("chicken thighs")).toBeUndefined()
    expect(await purchases()).toEqual([])
    await clearAll()
  })

  test("changing its amount keeps where the pantry item was moved to", async () => {
    const row = await typed("2 lb chicken thighs")
    await check(row, true)
    const stored = (await find("chicken thighs"))!
    const moved = await kyle.patch(`/api/pantry/items/${stored.id}`, {
      storedIn: "freezer",
    })
    expect(moved.status, await moved.clone().text()).toBe(200)
    await kyle.patch(`/api/list/items/${row.id}`, { amount: "3 lb" })
    expect(await pantry()).toMatchObject([
      { name: "chicken thighs", amount: "3 lb", storedIn: "freezer" },
    ])
    expect(await purchases()).toEqual(["chicken thighs"])
    await check(row, false)
    expect(await pantry()).toEqual([])
    await clearAll()
  })

  test("changing its amount keeps the use-by date the pantry item was given", async () => {
    const row = await typed("2 lb chicken thighs")
    await check(row, true)
    const stored = (await find("chicken thighs"))!
    const dated = await kyle.patch(`/api/pantry/items/${stored.id}`, {
      useBy: addDays(today, 30),
    })
    expect(dated.status, await dated.clone().text()).toBe(200)
    await kyle.patch(`/api/list/items/${row.id}`, { amount: "3 lb" })
    expect(await find("chicken thighs")).toMatchObject({
      amount: "3 lb",
      useBy: addDays(today, 30),
    })
    await clearAll()
  })

  test("changing its amount after cooking took some changes what's left by the difference", async () => {
    const row = await typed("3 lb chicken thighs")
    await check(row, true)
    const meal = await plan({
      date: today,
      meal: "dinner",
      recipe: ids["Lemon Chicken"],
    })
    await kyle.patch(`/api/plan/entries/${meal.id}`, { status: "cooked" })
    expect(await find("chicken thighs")).toMatchObject({ amount: "1 lb" })
    await kyle.patch(`/api/list/items/${row.id}`, { amount: "4 lb" })
    expect(await find("chicken thighs")).toMatchObject({ amount: "2 lb" })
    await check(row, false)
    expect(await find("chicken thighs")).toBeUndefined()
    await clearAll()
  })

  test("correcting its amount downwards leaves the difference", async () => {
    const row = await typed("3 lb chicken thighs")
    await check(row, true)
    await kyle.patch(`/api/list/items/${row.id}`, { amount: "2 lb" })
    expect(await find("chicken thighs")).toMatchObject({ amount: "2 lb" })
    await check(row, false)
    expect(await find("chicken thighs")).toBeUndefined()
    await clearAll()
  })

  test("sending the same name and amount again leaves the pantry alone", async () => {
    const row = await typed("2 lb chicken thighs")
    await check(row, true)
    const before = await putAwayOf(row)
    const stored = (await find("chicken thighs"))!
    await kyle.patch(`/api/pantry/items/${stored.id}`, { storedIn: "freezer" })
    await kyle.patch(`/api/list/items/${row.id}`, {
      name: " chicken thighs ",
      amount: "2 lb",
    })
    expect(await putAwayOf(row)).toEqual(before)
    expect(await pantry()).toMatchObject([
      { id: stored.id, amount: "2 lb", storedIn: "freezer" },
    ])
    expect(await purchases()).toEqual(["chicken thighs"])
    await clearAll()
  })

  test("sending its same name keeps the food of a row from the plan, so unchecking still takes it all back", async () => {
    // Someone said this recipe's line is chicken, so its row's food is
    // chicken, not the chicken thighs its name says.
    const recipe = (await (
      await kyle.post("/api/recipes", {
        name: "Chicken Tacos",
        servings: 4,
        steps: ["Cook it."],
        ingredients: ["2 lb chicken thighs"],
      })
    ).json()) as { id: string }
    const em = forHousehold(database.em.fork(), householdId)
    const line = await em.findOneOrFail(RecipeIngredient, {
      recipe: recipe.id,
    })
    line.foodKey = "chicken"
    line.foodSource = "person"
    await em.flush()
    await plan({ date: day(0), meal: "dinner", recipe: recipe.id })
    await fromPlan()
    const row = (await listItems()).find(
      (item) => item.name === "chicken thighs"
    )!
    await check(row, true)
    expect(await find("chicken thighs")).toMatchObject({ amount: "2 lb" })
    expect(await purchases()).toEqual(["chicken thighs"])

    const same = await kyle.patch(`/api/list/items/${row.id}`, {
      name: "chicken thighs",
    })
    expect(same.status, await same.clone().text()).toBe(200)
    await check(row, false)
    expect(await pantry()).toEqual([])
    expect(await purchases()).toEqual([])
    await clearAll()
  })

  test("correcting its amount after the pantry item was given an amount in words leaves that be", async () => {
    const row = await typed("2 lb chicken thighs")
    await check(row, true)
    const stored = (await find("chicken thighs"))!
    const changed = await kyle.patch(`/api/pantry/items/${stored.id}`, {
      amount: "a little",
    })
    expect(changed.status, await changed.clone().text()).toBe(200)

    const corrected = await kyle.patch(`/api/list/items/${row.id}`, {
      amount: "3 lb",
    })
    expect(corrected.status, await corrected.clone().text()).toBe(200)
    expect(await pantry()).toMatchObject([
      { id: stored.id, name: "chicken thighs", amount: "a little" },
    ])
    expect(await putAwayOf(row)).toMatchObject({ quantity: 3, unit: "pound" })
    expect(await purchases()).toEqual(["chicken thighs"])

    await check(row, false)
    expect(await pantry()).toMatchObject([
      { id: stored.id, amount: "a little" },
    ])
    expect(await purchases()).toEqual([])
    await clearAll()
  })

  test("giving an amount to a row that went in with none adds it to what was there", async () => {
    await add("1 lb rice")
    const row = await typed("rice")
    await check(row, true)
    expect(await find("rice")).toMatchObject({ amount: "1 lb" })
    await kyle.patch(`/api/list/items/${row.id}`, { amount: "2 lb" })
    expect(await pantry()).toMatchObject([{ name: "rice", amount: "3 lb" }])
    await check(row, false)
    expect(await pantry()).toMatchObject([{ name: "rice", amount: "1 lb" }])
    expect(await purchases()).toEqual([])
    await clearAll()
  })

  test("giving an amount to a row that joined what was there leaves that be once it's in words", async () => {
    await add("1 lb rice")
    const row = await typed("rice")
    await check(row, true)
    const stored = (await find("rice"))!
    const changed = await kyle.patch(`/api/pantry/items/${stored.id}`, {
      amount: "a little",
    })
    expect(changed.status, await changed.clone().text()).toBe(200)

    const corrected = await kyle.patch(`/api/list/items/${row.id}`, {
      amount: "2 lb",
    })
    expect(corrected.status, await corrected.clone().text()).toBe(200)
    expect(await pantry()).toMatchObject([
      { id: stored.id, name: "rice", amount: "a little" },
    ])
    expect(await purchases()).toEqual(["rice"])

    await check(row, false)
    expect(await pantry()).toMatchObject([
      { id: stored.id, amount: "a little" },
    ])
    expect(await purchases()).toEqual([])
    await clearAll()
  })

  test("renaming it takes the old food out and puts the new one in", async () => {
    const row = await typed("2 lb chicken thighs")
    await check(row, true)
    const renamed = await kyle.patch(`/api/list/items/${row.id}`, {
      name: "ground beef",
    })
    expect(renamed.status, await renamed.clone().text()).toBe(200)
    expect(await find("chicken thighs")).toBeUndefined()
    expect(await find("ground beef")).toMatchObject({ amount: "2 lb" })
    expect(await purchases()).toEqual(["ground beef"])
    await check(row, false)
    expect(await pantry()).toEqual([])
    expect(await purchases()).toEqual([])
    await clearAll()
  })

  test("clearing keeps it in the pantry, and Undo doesn't add it again", async () => {
    const row = await typed("2 lb chicken thighs")
    await check(row, true)
    const cleared = await (
      await kyle.post("/api/list/clear", { which: "checked" })
    ).json()
    expect(await find("chicken thighs")).toMatchObject({ amount: "2 lb" })
    const undo = await kyle.post("/api/list/restore", { items: cleared.before })
    expect(undo.status, await undo.clone().text()).toBe(200)
    expect(await find("chicken thighs")).toMatchObject({ amount: "2 lb" })
    await check(row, false)
    expect(await find("chicken thighs")).toBeUndefined()
    await clearAll()
  })

  test("deleting it keeps its food in the pantry", async () => {
    const row = await typed("2 lb chicken thighs")
    await check(row, true)
    const removed = await kyle.delete(`/api/list/items/${row.id}`)
    expect(removed.status, await removed.clone().text()).toBe(200)
    expect(await listItems()).toEqual([])
    expect(await find("chicken thighs")).toMatchObject({ amount: "2 lb" })
    await clearAll()
  })

  test("clearing the whole list keeps what's checked in the pantry", async () => {
    await check(await typed("2 lb chicken thighs"), true)
    await typed("1 gallon milk")
    const cleared = await kyle.post("/api/list/clear", { which: "all" })
    expect(cleared.status, await cleared.clone().text()).toBe(200)
    expect(await listItems()).toEqual([])
    expect(await find("chicken thighs")).toMatchObject({ amount: "2 lb" })
    expect(await find("milk")).toBeUndefined()
    await clearAll()
  })

  test("clearing puts away what was checked before the setting existed, and Undo then unchecking takes it back out", async () => {
    const row = await typed("2 lb chicken thighs")
    await checkedBeforeTheSetting([row])
    expect(await find("chicken thighs")).toBeUndefined()

    const cleared = await (
      await kyle.post("/api/list/clear", { which: "checked" })
    ).json()
    expect(await find("chicken thighs")).toMatchObject({ amount: "2 lb" })
    const undo = await kyle.post("/api/list/restore", { items: cleared.before })
    expect(undo.status, await undo.clone().text()).toBe(200)
    expect(await find("chicken thighs")).toMatchObject({ amount: "2 lb" })
    await check(row, false)
    expect(await find("chicken thighs")).toBeUndefined()
    await clearAll()
  })

  test("taking rows off another list puts away what was checked before the setting existed, and only those", async () => {
    // With a list for each store, the page clears a list by taking its
    // checked rows off.
    const costco = await secondList()
    try {
      const chicken = (await (
        await kyle.post("/api/list/items", {
          text: "2 lb chicken thighs",
          list: costco,
        })
      ).json()) as ListItem
      const milk = await typed("1 gallon milk")
      await checkedBeforeTheSetting([chicken, milk])

      const res = await kyle.post("/api/list/items/bulk", {
        ids: [chicken.id],
        action: "remove",
      })
      expect(res.status, await res.clone().text()).toBe(200)
      const { before } = await res.json()
      expect(await find("chicken thighs")).toMatchObject({ amount: "2 lb" })
      expect(await purchases()).toEqual(["chicken thighs"])
      // The milk wasn't taken off, so it's left as it was.
      expect(await find("milk")).toBeUndefined()
      expect(await putAwayOf(milk)).toBeNull()

      const undo = await kyle.post("/api/list/restore", { items: before })
      expect(undo.status, await undo.clone().text()).toBe(200)
      expect(await find("chicken thighs")).toMatchObject({ amount: "2 lb" })
      await check(chicken, false)
      expect(await find("chicken thighs")).toBeUndefined()
      expect(await purchases()).toEqual([])
    } finally {
      await clearAll()
      await oneList()
    }
  })

  test("deleting a row puts it away when it was checked before the setting existed, and Undo then unchecking takes it back out", async () => {
    const row = await typed("2 lb chicken thighs")
    await checkedBeforeTheSetting([row])

    const removed = await kyle.delete(`/api/list/items/${row.id}`)
    expect(removed.status, await removed.clone().text()).toBe(200)
    const snapshot = await removed.json()
    expect(await find("chicken thighs")).toMatchObject({ amount: "2 lb" })
    expect(await purchases()).toEqual(["chicken thighs"])

    const undo = await kyle.post("/api/list/restore", { items: [snapshot] })
    expect(undo.status, await undo.clone().text()).toBe(200)
    expect(await find("chicken thighs")).toMatchObject({ amount: "2 lb" })
    await check(row, false)
    expect(await find("chicken thighs")).toBeUndefined()
    expect(await purchases()).toEqual([])
    await clearAll()
  })

  test("unchecking after cooking took some takes back only what's left", async () => {
    const row = await typed("3 lb chicken thighs")
    await check(row, true)
    const meal = await plan({
      date: today,
      meal: "dinner",
      recipe: ids["Lemon Chicken"],
    })
    const cooked = await kyle.patch(`/api/plan/entries/${meal.id}`, {
      status: "cooked",
    })
    expect(cooked.status, await cooked.clone().text()).toBe(200)
    // The meal takes 2 lb of the 3.
    expect(await find("chicken thighs")).toMatchObject({ amount: "1 lb" })
    await check(row, false)
    expect(await find("chicken thighs")).toBeUndefined()
    await clearAll()
  })

  test("unchecking after the pantry item was used up changes nothing else", async () => {
    const row = await typed("2 lb chicken thighs")
    await check(row, true)
    const stored = (await find("chicken thighs"))!
    const used = await kyle.delete(`/api/pantry/items/${stored.id}`)
    expect(used.status, await used.clone().text()).toBe(200)
    await check(row, false)
    expect(await pantry()).toEqual([])
    expect(await purchases()).toEqual([])
    await clearAll()
  })

  test("unchecking after the pantry item was given an amount in words leaves it", async () => {
    const row = await typed("2 lb chicken thighs")
    await check(row, true)
    const stored = (await find("chicken thighs"))!
    const changed = await kyle.patch(`/api/pantry/items/${stored.id}`, {
      amount: "half a bag",
    })
    expect(changed.status, await changed.clone().text()).toBe(200)
    await check(row, false)
    expect(await find("chicken thighs")).toMatchObject({ amount: "half a bag" })
    await clearAll()
  })

  test("a snapshot from before put-away records still restores", async () => {
    const milk = await typed("1 gallon milk")
    const removed = await kyle.delete(`/api/list/items/${milk.id}`)
    expect(removed.status, await removed.clone().text()).toBe(200)
    const { putAway: _putAway, ...snapshot } = await removed.json()
    expect("putAway" in snapshot).toBe(false)
    const restored = await kyle.post("/api/list/restore", {
      items: [{ ...snapshot, checked: true }],
    })
    expect(restored.status, await restored.clone().text()).toBe(200)
    expect(await listItems()).toMatchObject([{ name: "milk", checked: true }])
    await clearAll()
  })

  test("with the setting off, checking leaves the pantry alone and Put away works as before", async () => {
    await setting(false)
    try {
      await check(await typed("1 gallon milk"), true)
      expect(await find("milk")).toBeUndefined()
      const res = await kyle.post("/api/list/put-away", {})
      expect(await res.json()).toEqual({ stored: 1, cleared: 0 })
      expect(await find("milk")).toMatchObject({ amount: "1 gal" })
    } finally {
      await setting(true)
    }
    await clearAll()
  })

  test("turning the setting on puts away what's already checked, once", async () => {
    await setting(false)
    try {
      await check(await typed("1 gallon milk"), true)
      await setting(true)
    } finally {
      await setting(true)
    }
    expect(await find("milk")).toMatchObject({ amount: "1 gal" })
    // Saving it on again, as it already is, doesn't put it away twice.
    await setting(true)
    expect(await find("milk")).toMatchObject({ amount: "1 gal" })
    const res = await kyle.post("/api/list/put-away", {})
    expect(await res.json()).toEqual({ stored: 0, cleared: 1 })
    expect(await find("milk")).toMatchObject({ amount: "1 gal" })
    await clearAll()
  })
})

describe("looking over what went in", () => {
  test("says what went in and hasn't been looked over, each pantry item once", async () => {
    // Two rows for chicken thighs and one for milk, all checked; one more
    // row, for eggs, whose pantry item is then deleted.
    await check(await typed("2 lb chicken thighs"), true)
    await check(await typed("1 lb chicken thighs"), true)
    await check(await typed("1 gallon milk"), true)
    await check(await typed("12 eggs"), true)
    await kyle.delete(`/api/pantry/items/${(await find("eggs"))!.id}`)

    const review = await (await kyle.get("/api/list/put-away")).json()
    expect(review.items.map((item: { name: string }) => item.name)).toEqual([
      "chicken thighs",
      "milk",
    ])
    expect(review.rows).toHaveLength(3)
    const marked = await kyle.post("/api/list/put-away/looked-over", {
      rows: review.rows,
    })
    expect(await marked.json()).toEqual({ changed: 3 })
    expect((await (await kyle.get("/api/list/put-away")).json()).items).toEqual(
      []
    )
    // Saying so again changes nothing.
    const again = await kyle.post("/api/list/put-away/looked-over", {
      rows: review.rows,
    })
    expect(await again.json()).toEqual({ changed: 0 })
    await clearAll()
  })
})
