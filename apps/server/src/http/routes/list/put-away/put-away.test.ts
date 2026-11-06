import { addDays, clockIn, weekStartOf } from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import { Purchase, ShoppingItem } from "../../../../database/entities/index.ts"
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
  await kyle.post("/api/pantry/clear")
  await kyle.post("/api/list/clear", { which: "all" })
  // Nothing takes purchases out of the history but unchecking, so the
  // tests start each other clean straight from the database.
  await forHousehold(database.em.fork(), householdId).nativeDelete(Purchase, {})
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
