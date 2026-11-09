import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import { RecipeNotDuplicate } from "../../../../database/entities/index.ts"
import type { Database } from "../../../../database/orm.ts"
import { HOUSEHOLD_FILTER } from "../../../../database/scope.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../../test/app.ts"

// Possible duplicates: recipes with the same link under any address, or
// the same name by its words. Kyle and Jamie share Home; Sam has the Cabin,
// with a "Lemon Chicken" of his own that Home never sees.

let app: App
let database: Database
let close: () => Promise<void>
let kyle: TestClient
let jamie: TestClient
let sam: TestClient
const ids: Record<string, string> = {}
let samsChicken: string

type Duplicate = { name: string; reasons: string[] }
type Pair = { recipes: Duplicate[]; reasons: string[] }

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, database, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  const home = (await (await kyle.get("/api/households/current")).json()).id
  await kyle.post("/api/households", { name: "Cabin" })
  sam = await join(app, await inviteToken(kyle), account("sam", "Sam"))
  await kyle.post("/api/auth/organization/set-active", { organizationId: home })
  jamie = await join(app, await inviteToken(kyle), account("jamie", "Jamie"))

  const recipes = [
    {
      name: "Lemon Chicken",
      sourceUrl: "https://cooking.example/lemon-chicken",
      ingredients: [
        "4 chicken thighs",
        "2 lemons",
        "3 cloves garlic",
        "1 tsp salt",
      ],
    },
    { name: "Chicken with Lemon" },
    {
      name: "Roast Lemon Chicken Thighs",
      sourceUrl: "http://www.cooking.example/lemon-chicken/",
    },
    { name: "Tomato Soup" },
  ]
  for (const recipe of recipes) {
    const res = await kyle.post("/api/recipes", recipe)
    expect(res.status, await res.clone().text()).toBe(201)
    ids[recipe.name] = (await res.json()).id
  }
  samsChicken = (
    await (await sam.post("/api/recipes", { name: "Lemon Chicken" })).json()
  ).id
})

afterAll(() => close())

const duplicatesOf = async (recipe: string, who = kyle) =>
  (await (await who.get(`/api/recipes/${recipe}/duplicates`)).json())
    .duplicates as Duplicate[]
const pairs = async (who = kyle) =>
  (await (await who.get("/api/recipes/duplicates")).json()).pairs as Pair[]
const pairNames = (found: Pair[]) =>
  found.map((pair) => pair.recipes.map((recipe) => recipe.name))
const dismiss = (recipe: string, other: string) =>
  kyle.post(`/api/recipes/${recipe}/duplicates/${other}/dismiss`)

describe("possible duplicates", () => {
  test("finds a recipe's duplicates, the same link first", async () => {
    const found = await duplicatesOf("lemon-chicken")
    expect(found.map((d) => [d.name, d.reasons])).toEqual([
      ["Roast Lemon Chicken Thighs", ["link"]],
      ["Chicken with Lemon", ["name"]],
    ])
    expect(found[0]).toMatchObject({
      slug: "roast-lemon-chicken-thighs",
      photo: null,
      createdAt: expect.any(String),
    })
  })

  test("lists each pair once, newest first", async () => {
    const found = await pairs()
    expect(pairNames(found)).toEqual([
      ["Lemon Chicken", "Roast Lemon Chicken Thighs"],
      ["Lemon Chicken", "Chicken with Lemon"],
    ])
    expect(found.map((pair) => pair.reasons)).toEqual([["link"], ["name"]])
  })

  test("leaves out Recently deleted recipes, and doesn't bring dismissed pairs back with them", async () => {
    const res = await dismiss("lemon-chicken", "chicken-with-lemon")
    expect(res.status, await res.clone().text()).toBe(204)
    await kyle.delete("/api/recipes/chicken-with-lemon")
    expect(pairNames(await pairs())).toEqual([
      ["Lemon Chicken", "Roast Lemon Chicken Thighs"],
    ])

    const restored = await kyle.post(
      `/api/recipes/deleted/${ids["Chicken with Lemon"]}/restore`
    )
    expect(restored.status, await restored.clone().text()).toBe(200)
    expect(pairNames(await pairs())).toEqual([
      ["Lemon Chicken", "Roast Lemon Chicken Thighs"],
    ])
    expect((await duplicatesOf("lemon-chicken")).map((d) => d.name)).toEqual([
      "Roast Lemon Chicken Thighs",
    ])
  })

  test("keeps 'not the same' for everyone, and saying it twice is fine", async () => {
    const other = ids["Roast Lemon Chicken Thighs"]!
    expect((await dismiss("lemon-chicken", other)).status).toBe(204)
    expect((await dismiss(other, "lemon-chicken")).status).toBe(204)
    expect(await pairs(jamie)).toEqual([])
    expect(await duplicatesOf("lemon-chicken", jamie)).toEqual([])
    expect(await pairs(sam)).toEqual([])
  })

  test("won't dismiss a recipe against itself, or another household's", async () => {
    const itself = await dismiss("lemon-chicken", "lemon-chicken")
    expect(itself.status).toBe(400)
    expect((await itself.json()).error.code).toBe("same_recipe")
    expect((await dismiss("lemon-chicken", samsChicken)).status).toBe(404)
  })

  test("takes its dismissals with it when deleted for good", async () => {
    const gone = ids["Chicken with Lemon"]!
    await kyle.delete(`/api/recipes/${gone}`)
    const res = await kyle.delete(`/api/recipes/deleted/${gone}`)
    expect(res.status, await res.clone().text()).toBe(204)

    const rows = await database.em
      .fork()
      .find(RecipeNotDuplicate, {}, { filters: { [HOUSEHOLD_FILTER]: false } })
    const named = rows.flatMap((row) => [row.first.id, row.second.id])
    expect(named).not.toContain(gone)
    expect(named).toContain(ids["Lemon Chicken"])
  })

  test("is open to keys that may read, and dismissing to keys that may write", async () => {
    const key = (
      await (
        await kyle.post("/api/auth/api-keys", {
          name: "Recipe reader",
          permissions: { recipes: "read" },
          expiresInDays: 30,
        })
      ).json()
    ).key
    const withKey = (path: string, method = "GET") =>
      app.request(`${TEST_ORIGIN}${path}`, {
        method,
        headers: { authorization: `Bearer ${key}` },
      })
    expect((await withKey("/api/recipes/duplicates")).status).toBe(200)
    expect(
      (await withKey("/api/recipes/lemon-chicken/duplicates")).status
    ).toBe(200)
    expect(
      (
        await withKey(
          `/api/recipes/lemon-chicken/duplicates/${ids["Tomato Soup"]}/dismiss`,
          "POST"
        )
      ).status
    ).toBe(403)
  })

  test("keeps the word for its own page", async () => {
    const res = await kyle.post("/api/recipes", { name: "Duplicates" })
    expect(res.status, await res.clone().text()).toBe(201)
    expect((await res.json()).slug).not.toBe("duplicates")
  })
})
