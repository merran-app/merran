import { clockIn } from "@merran/shared"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../../test/app.ts"

// Ran out of anything? after cooking: what ran out is used up at home and
// goes on the list. In a household on UTC.

let app: App
let close: () => Promise<void>
let kyle: TestClient
let today: string
const ids: Record<string, string> = {}

type Item = {
  id: string
  name: string
  amount: string
  storedIn: string | null
}

type Food = { food: string; name: string; staple: boolean }

async function pantry(): Promise<Item[]> {
  const res = await kyle.get("/api/pantry")
  expect(res.status).toBe(200)
  return (await res.json()).items
}

const namesAtHome = async () =>
  (await pantry()).map((item) => `${item.name} (${item.storedIn})`).sort()

async function list(): Promise<{ id: string; name: string; meals: [] }[]> {
  return (await (await kyle.get("/api/list")).json()).items
}

async function add(text: string, storedIn?: string) {
  const res = await kyle.post("/api/pantry/items", { text, storedIn })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as Item
}

/** A meal of Lemon Chicken with Garlic Bread today, cooked. */
async function cooked() {
  const res = await kyle.post("/api/plan/entries", {
    date: today,
    meal: "dinner",
    recipe: ids["Lemon Chicken"],
    withRecipe: ids["Garlic Bread"],
  })
  expect(res.status, await res.clone().text()).toBe(201)
  const meal = (await res.json()) as { id: string }
  await kyle.patch(`/api/plan/entries/${meal.id}`, { status: "cooked" })
  return meal
}

async function foodsFor(meal: string): Promise<Food[]> {
  const res = await kyle.get(`/api/pantry/ran-out?meal=${meal}`)
  expect(res.status, await res.clone().text()).toBe(200)
  return (await res.json()).foods
}

async function ranOut(meal: string, foods: string[], toList = true) {
  const res = await kyle.post("/api/pantry/ran-out", {
    meal,
    foods,
    list: toList,
  })
  expect(res.status, await res.clone().text()).toBe(200)
  return res.json()
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
  for (const recipe of [
    {
      name: "Lemon Chicken",
      ingredients: [
        "2 lb chicken thighs",
        "1 cup rice",
        "1 tbsp olive oil",
        "salt",
        "1 cup water",
      ],
    },
    {
      name: "Garlic Bread",
      ingredients: ["1 baguette", "2 cloves garlic", "1 pinch salt"],
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

afterEach(async () => {
  const entries = (
    await (await kyle.get(`/api/plan?from=${today}&to=${today}`)).json()
  ).entries
  if (entries.length > 0) {
    await kyle.post("/api/plan/entries/bulk", {
      ids: entries.map((entry: { id: string }) => entry.id),
      action: "remove",
    })
  }
  await kyle.post("/api/pantry/clear")
  await kyle.post("/api/list/clear", { which: "all" })
})

describe("what could have run out", () => {
  test("is each of the meal's foods once, its side's too, in order, with staples and without water", async () => {
    const meal = await cooked()
    expect(await foodsFor(meal.id)).toEqual([
      { food: expect.any(String), name: "chicken thighs", staple: false },
      { food: expect.any(String), name: "rice", staple: false },
      { food: expect.any(String), name: "olive oil", staple: false },
      { food: "salt", name: "salt", staple: true },
      { food: expect.any(String), name: "baguette", staple: false },
      { food: expect.any(String), name: "garlic", staple: false },
    ])
  })

  test("is only asked of the household's own meals", async () => {
    const res = await kyle.get(
      "/api/pantry/ran-out?meal=00000000-0000-4000-8000-000000000000"
    )
    expect(res.status).toBe(404)
  })
})

describe("running out", () => {
  test("uses up what's at home, but not the freezer's, and lists it", async () => {
    await add("1 cup olive oil", "cupboard")
    await add("4 lb chicken thighs", "fridge")
    await add("2 lb chicken thighs", "freezer")
    await add("2 lb rice", "cupboard")
    const meal = await cooked()
    const [chicken, rice, oil] = await foodsFor(meal.id)

    const result = await ranOut(meal.id, [chicken!.food, oil!.food])
    expect(await namesAtHome()).toEqual([
      "chicken thighs (freezer)",
      "rice (cupboard)",
    ])
    expect(
      result.usedUp.map((item: { name: string }) => item.name).sort()
    ).toEqual(["chicken thighs", "olive oil"])
    expect((await list()).map((item) => item.name).sort()).toEqual([
      "chicken thighs",
      "olive oil",
    ])
    expect(result.listed).toHaveLength(2)
    for (const item of await list()) expect(item.meals).toEqual([])
    expect(rice).toBeDefined()
  })

  test("uses up the freezer's when that's where cooking took it from", async () => {
    await add("3 lb chicken thighs", "freezer")
    await add("4 cups rice", "freezer")
    const meal = await cooked()
    const [chicken, rice] = await foodsFor(meal.id)
    expect(await namesAtHome()).toEqual([
      "chicken thighs (freezer)",
      "rice (freezer)",
    ])

    await ranOut(meal.id, [chicken!.food])
    expect(await namesAtHome()).toEqual(["rice (freezer)"])
    // Rice from the freezer was used too, so its running out counts there.
    await ranOut(meal.id, [rice!.food], false)
    expect(await namesAtHome()).toEqual([])
  })

  test("puts staples on the list, and lists nothing with the switch off", async () => {
    const meal = await cooked()
    await ranOut(meal.id, ["salt"])
    expect((await list()).map((item) => item.name)).toEqual(["salt"])

    await add("1 cup olive oil", "cupboard")
    const oil = (await foodsFor(meal.id))[2]!
    const result = await ranOut(meal.id, [oil.food], false)
    expect(result.listed).toEqual([])
    expect(await namesAtHome()).toEqual([])
    expect((await list()).map((item) => item.name)).toEqual(["salt"])
  })

  test("doesn't list a food twice", async () => {
    await kyle.post("/api/list/items", { text: "salt" })
    const meal = await cooked()
    const result = await ranOut(meal.id, ["salt"])
    expect(result.listed).toEqual([])
    expect((await list()).map((item) => item.name)).toEqual(["salt"])
  })

  test("doesn't list a food when a kind of it is on the list", async () => {
    await kyle.post("/api/list/items", { text: "kosher salt" })
    const meal = await cooked()
    const result = await ranOut(meal.id, ["salt"])
    expect(result.listed).toEqual([])
    expect((await list()).map((item) => item.name)).toEqual(["kosher salt"])
  })

  test("is only for a meal that was cooked", async () => {
    await add("1 cup olive oil", "cupboard")
    const res = await kyle.post("/api/plan/entries", {
      date: today,
      meal: "dinner",
      recipe: ids["Lemon Chicken"],
    })
    const meal = (await res.json()) as { id: string }
    const oil = (await foodsFor(meal.id))[2]!
    const answer = await kyle.post("/api/pantry/ran-out", {
      meal: meal.id,
      foods: [oil.food],
      list: true,
    })
    expect(answer.status).toBe(409)
    expect(await namesAtHome()).toEqual(["olive oil (cupboard)"])
    expect(await list()).toEqual([])
  })

  test("comes undone through the pantry's and list's restore", async () => {
    await add("1 cup olive oil", "cupboard")
    const meal = await cooked()
    const oil = (await foodsFor(meal.id))[2]!
    const result = await ranOut(meal.id, [oil.food])

    const pantryBack = await kyle.post("/api/pantry/restore", {
      items: result.usedUp,
    })
    expect(pantryBack.status).toBe(200)
    const listBack = await kyle.post("/api/list/restore", {
      items: [],
      remove: result.listed.map((item: { id: string }) => item.id),
    })
    expect(listBack.status, await listBack.clone().text()).toBe(200)
    expect(await namesAtHome()).toEqual(["olive oil (cupboard)"])
    expect(await list()).toEqual([])
  })

  test("stays run out when the meal is marked not cooked", async () => {
    await add("4 lb chicken thighs", "fridge")
    const meal = await cooked()
    const [chicken] = await foodsFor(meal.id)
    await ranOut(meal.id, [chicken!.food], false)
    await kyle.patch(`/api/plan/entries/${meal.id}`, { status: "planned" })
    // Cooking took 2 lb and puts that back; the 2 lb that ran out stays out.
    expect(await pantry()).toMatchObject([
      { name: "chicken thighs", amount: "2 lb" },
    ])
  })

  test("needs the pantry permission", async () => {
    const meal = await cooked()
    const key = (
      await (
        await kyle.post("/api/auth/api-keys", {
          name: "Shopping",
          permissions: { list: "write", pantry: "read" },
          expiresInDays: 30,
        })
      ).json()
    ).key
    const res = await app.request(`${TEST_ORIGIN}/api/pantry/ran-out`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ meal: meal.id, foods: ["salt"], list: true }),
    })
    expect(res.status).toBe(403)
  })
})
