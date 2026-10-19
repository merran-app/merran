import { afterAll, beforeAll, beforeEach, expect, test } from "vitest"
import { addDays, clockIn } from "@merran/shared"
import {
  createTestApp,
  setUpServer,
  type TestClient,
} from "../../../../../../test/app.ts"

let app: Awaited<ReturnType<typeof createTestApp>>["app"]
let who: TestClient
let close: () => Promise<void>
let day: string
let serial = 0
beforeAll(async () => {
  const setup = await createTestApp()
  close = setup.close
  app = setup.app
  who = await setUpServer(setup.app, setup.setupCode)
  day = addDays(clockIn("UTC").today, 7)
})
afterAll(() => close())
beforeEach(async () => {
  await who.put("/api/households/current/tastes", {
    avoid: [],
    diets: [],
    weeknightMinutes: null,
  })
  await who.post("/api/list/clear", { which: "all" })
  const plan = await (await who.get(`/api/plan?from=${day}&to=${day}`)).json()
  if (plan.entries.length)
    await who.post("/api/plan/entries/bulk", {
      ids: plan.entries.map((entry: { id: string }) => entry.id),
      action: "remove",
    })
  await who.post("/api/pantry/clear")
})
const items = async () => (await (await who.get("/api/list")).json()).items
const item = async (name: string) =>
  (await items()).find((item: { name: string }) =>
    item.name.toLowerCase().includes(name)
  )
async function recipe(ingredients = ["2 cups broccoli", "1 onion"]) {
  return (
    await who.post("/api/recipes", {
      name: `Shopping dish ${++serial}`,
      servings: 4,
      ingredients,
      steps: ["Cook the broccoli with the onion."],
    })
  ).json()
}
async function meal(recipeId: string, extra: Record<string, unknown> = {}) {
  return (
    await who.post("/api/plan/entries", {
      date: day,
      meal: "dinner",
      recipe: recipeId,
      ...extra,
    })
  ).json()
}
async function list() {
  const res = await who.post("/api/list/from-plan", { from: day, to: day })
  expect(res.status, await res.clone().text()).toBe(200)
}
async function target(itemId: string, mealId?: string) {
  const res = await who.get(`/api/list/items/${itemId}/substitutions`)
  expect(res.status).toBe(200)
  const { targets } = await res.json()
  return mealId
    ? targets.find((value: { mealId: string }) => value.mealId === mealId)
    : targets[0]
}
async function apply(
  itemId: string,
  context: any,
  extra: Record<string, unknown> = {}
) {
  return who.post(`/api/list/items/${itemId}/substitutions`, {
    recipeId: context.recipe.recipeId,
    ingredientId: context.ingredientId,
    state: context.state,
    targets: [{ mealId: context.mealId, revision: context.revision }],
    lines: ["2 cups green beans"],
    ...extra,
  })
}

test("replaces one meal's main ingredient, keeps its side, other meals, manual quantities and purchases; Undo restores needs", async () => {
  const main = await recipe()
  const side = await recipe(["1 cup broccoli"])
  await who.post("/api/list/items", { text: "3 cups broccoli" })
  const first = await meal(main.id, { servings: 8, withRecipe: side.id })
  await meal(main.id)
  await list()
  const broccoli = await item("broccoli")
  expect(broccoli.quantity).toBe(11)
  const onion = await item("onion")
  await who.patch(`/api/list/items/${onion.id}`, { checked: true })
  const purchased = await item("onion")
  await who.post("/api/pantry/items", { text: "1 cup green beans" })
  const context = await target(broccoli.id, first.id)
  const res = await apply(broccoli.id, context)
  expect(res.status, await res.clone().text()).toBe(200)
  expect((await item("broccoli")).quantity).toBe(7)
  expect((await item("green beans")).quantity).toBe(3)
  expect(await item("onion")).toEqual(purchased)
  const saved = await (await who.get(`/api/plan/entries/${first.id}`)).json()
  expect(saved.variants[0].ingredients[0].text).toBe("2 cups green beans")
  expect(saved.variants[0].steps[0].text).toContain("green beans")
  expect(
    (await (await who.get(`/api/recipes/${main.id}`)).json()).ingredients[0]
      .text
  ).toBe("2 cups broccoli")
  const done = await res.json()
  const undone = await who.post("/api/list/substitutions/undo", done.undo)
  expect(undone.status, await undone.clone().text()).toBe(200)
  expect((await item("broccoli")).quantity).toBe(11)
  expect(await item("green beans")).toBeUndefined()
  expect(await item("onion")).toEqual(purchased)
})

test("keeps a meal snapshot after library edits, and supports replacing the substitute again", async () => {
  const base = await recipe()
  const entry = await meal(base.id)
  await list()
  const original = await item("broccoli")
  const res = await apply(original.id, await target(original.id))
  expect(res.status).toBe(200)
  await who.patch(`/api/recipes/${base.id}`, {
    ...base,
    ingredients: ["4 cups carrots"],
    steps: ["Cook carrots."],
  })
  const saved = await (await who.get(`/api/plan/entries/${entry.id}`)).json()
  expect(saved.variants[0].ingredients[0].text).toBe("2 cups green beans")
  const beans = await item("green beans")
  const next = await target(beans.id)
  expect(next.canSaveToLibrary).toBe(false)
  const changed = await apply(beans.id, next, { lines: ["2 cups zucchini"] })
  expect(changed.status, await changed.clone().text()).toBe(200)
  expect(await item("green beans")).toBeUndefined()
  expect(await item("zucchini")).toBeDefined()
})

test("rejects stale meal context and does not partially change the list", async () => {
  const base = await recipe()
  const entry = await meal(base.id)
  await list()
  const broccoli = await item("broccoli")
  const context = await target(broccoli.id)
  await who.patch(`/api/plan/entries/${entry.id}`, { servings: 8 })
  const before = await items()
  const res = await apply(broccoli.id, context)
  expect([404, 409]).toContain(res.status)
  expect(await items()).toEqual(before)
})

test("requires an explicit library choice, keeps a version, and undoes both scopes", async () => {
  const base = await recipe()
  await meal(base.id)
  await list()
  const broccoli = await item("broccoli")
  const res = await apply(broccoli.id, await target(broccoli.id), {
    saveToLibrary: true,
  })
  expect(res.status, await res.clone().text()).toBe(200)
  expect(
    (await (await who.get(`/api/recipes/${base.id}`)).json()).ingredients[0]
      .text
  ).toBe("2 cups green beans")
  const done = await res.json()
  expect(done.undo.library).not.toBeNull()
  const undone = await who.post("/api/list/substitutions/undo", done.undo)
  expect(undone.status, await undone.clone().text()).toBe(200)
  expect(
    (await (await who.get(`/api/recipes/${base.id}`)).json()).ingredients[0]
      .text
  ).toBe("2 cups broccoli")
})

test("manual replacements change only the shopping item, with Undo", async () => {
  const original = await (
    await who.post("/api/list/items", { text: "2 paper towels" })
  ).json()
  const res = await who.post(`/api/list/items/${original.id}/substitutions`, {
    ingredientId: "",
    targets: [],
    lines: ["3 napkins"],
  })
  expect(res.status, await res.clone().text()).toBe(200)
  expect(
    (await items()).find((item: { id: string }) => item.id === original.id).name
  ).toBe("napkins")
  const done = await res.json()
  expect(
    (await who.post("/api/list/substitutions/undo", done.undo)).status
  ).toBe(200)
  expect(
    (await items()).find((item: { id: string }) => item.id === original.id)
  ).toEqual(original)
})

test("cannot use a manual replacement to bypass planned-meal scope", async () => {
  const base = await recipe()
  await meal(base.id)
  await list()
  const broccoli = await item("broccoli")
  expect(
    (
      await who.post(`/api/list/items/${broccoli.id}/substitutions`, {
        ingredientId: "",
        targets: [],
        lines: ["1 cup peas"],
      })
    ).status
  ).toBe(409)
})

test("Undo preserves a bought replacement and detaches its old meal reservation", async () => {
  const base = await recipe()
  await meal(base.id)
  await list()
  const broccoli = await item("broccoli")
  const res = await apply(broccoli.id, await target(broccoli.id))
  expect(res.status).toBe(200)
  const beans = await item("green beans")
  await who.patch(`/api/list/items/${beans.id}`, { checked: true })
  const done = await res.json()
  const undo = await who.post("/api/list/substitutions/undo", done.undo)
  expect(undo.status, await undo.clone().text()).toBe(200)
  expect(await item("green beans")).toMatchObject({
    id: beans.id,
    checked: true,
    quantity: 2,
    meals: [],
  })
  expect(await item("broccoli")).toBeDefined()
})

test("rejects a known allergen and preserves every list quantity", async () => {
  const base = await recipe()
  await meal(base.id)
  await list()
  const broccoli = await item("broccoli")
  const context = await target(broccoli.id)
  const before = await items()
  expect(
    (
      await who.put("/api/households/current/tastes", {
        avoid: [{ food: "peanuts", level: "allergy", who: null }],
        diets: [],
        weeknightMinutes: null,
      })
    ).status
  ).toBe(200)
  const res = await apply(broccoli.id, context, { lines: ["1 cup peanuts"] })
  expect(res.status).toBe(400)
  expect(await items()).toEqual(before)
})
test("does not expose other households' shopping contexts or permit a key to edit several resources", async () => {
  const base = await recipe()
  await meal(base.id)
  await list()
  const broccoli = await item("broccoli")
  const context = await target(broccoli.id)
  const home = (await (await who.get("/api/households/current")).json()).id
  const key = (
    await (
      await who.post("/api/auth/api-keys", {
        name: "List only",
        permissions: { list: "write" },
        expiresInDays: 30,
      })
    ).json()
  ).key
  const response = await app.request(
    "http://merran.test/api/list/items/" + broccoli.id + "/substitutions",
    { headers: { authorization: "Bearer " + key } }
  )
  expect(response.status).toBe(403)
  await who.post("/api/households", { name: "Elsewhere" })
  expect(
    (await who.get("/api/list/items/" + broccoli.id + "/substitutions")).status
  ).toBe(404)
  expect((await apply(broccoli.id, context)).status).toBe(404)
  await who.post("/api/auth/organization/set-active", { organizationId: home })
})
test("rejects ambiguous manual amounts and rolls back all meal changes", async () => {
  const base = await recipe()
  await meal(base.id)
  await list()
  const broccoli = await item("broccoli")
  const context = await target(broccoli.id)
  await who.patch("/api/list/items/" + broccoli.id, { amount: "one big bag" })
  const before = await items()
  const res = await apply(broccoli.id, context)
  expect(res.status).toBe(409)
  expect(await items()).toEqual(before)
})

test("keeps an adjusted side when replacing the main and drops it when removing the side", async () => {
  const main = await recipe(["1 cup rice"])
  const side = await recipe()
  const replacement = await recipe(["1 cup lentils"])
  const entry = await meal(main.id, { withRecipe: side.id })
  await list()
  const broccoli = await item("broccoli")
  const context = await target(broccoli.id, entry.id)
  const changed = await apply(broccoli.id, context)
  expect(changed.status, await changed.clone().text()).toBe(200)
  const replaced = await who.patch(`/api/plan/entries/${entry.id}`, {
    recipe: replacement.id,
  })
  expect(replaced.status).toBe(200)
  const saved = await (await who.get(`/api/plan/entries/${entry.id}`)).json()
  expect(saved.variants).toHaveLength(1)
  expect(saved.variants[0].recipeId).toBe(side.id)
  expect(saved.variants[0].ingredients[0].text).toBe("2 cups green beans")
  expect(
    (await who.patch(`/api/plan/entries/${entry.id}`, { withRecipe: null }))
      .status
  ).toBe(200)
  expect(
    (await (await who.get(`/api/plan/entries/${entry.id}`)).json()).variants
  ).toEqual([])
})
