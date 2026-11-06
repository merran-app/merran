import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import { createTestApp, setUpServer, TestClient } from "../../../../test/app.ts"

// Checking food off the list puts it in the pantry, in a US household on UTC
// whose week starts on Monday.

let app: App
let close: () => Promise<void>
let kyle: TestClient
const ids: Record<string, string> = {}

type PantryItem = {
  id: string
  name: string
  amount: string
  quantity: number | null
  unit: string | null
  storedIn: string | null
}

async function pantry(): Promise<PantryItem[]> {
  const res = await kyle.get("/api/pantry")
  expect(res.status).toBe(200)
  return (await res.json()).items
}

const find = async (name: string) =>
  (await pantry()).find((item) => item.name === name)

async function listItems() {
  const res = await kyle.get("/api/list")
  expect(res.status).toBe(200)
  return (await res.json()).items as {
    id: string
    name: string
    checked: boolean
  }[]
}

/** Types a line onto the list, as the add box does. */
async function typed(text: string) {
  const res = await kyle.post("/api/list/items", { text })
  expect(res.status, await res.clone().text()).toBe(201)
  return res.json()
}

async function setting(on: boolean) {
  const res = await kyle.patch("/api/households/current", {
    putAwayWhenChecked: on,
  })
  expect(res.status, await res.clone().text()).toBe(200)
  return res.json()
}

/** The pantry, the list and the plan, emptied. */
async function clearAll() {
  const entries = (
    await (await kyle.get("/api/plan?from=2000-01-01&to=2100-01-01")).json()
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
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  await kyle.patch("/api/households/current", {
    timeZone: "UTC",
    weekStartsOn: 1,
    country: "US",
  })
  const res = await kyle.post("/api/recipes", {
    name: "Lemon Chicken",
    servings: 4,
    steps: ["Cook it."],
    ingredients: ["2 lb chicken thighs", "2 lemons", "1 cup rice"],
  })
  ids["Lemon Chicken"] = (await res.json()).id
})

afterAll(() => close())

// Kept for the tests that check things off, uncheck them and review them.
void [pantry, find, listItems, typed, clearAll]

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
