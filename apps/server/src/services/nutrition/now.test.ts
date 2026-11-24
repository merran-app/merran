import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { Job } from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { forHousehold } from "../../database/scope.ts"
import { createTestApp, setUpServer, type TestClient } from "../../test/app.ts"
import type { Fetcher } from "../fetch/public-fetch.ts"
import { ACTIVE } from "../jobs/jobs.ts"
import type { JobRunner } from "../jobs/runner.ts"
import { loadRecipe } from "../recipes/recipes.ts"
import type { Settings } from "../settings/settings.ts"
import { workOutNutritionNow } from "./runs.ts"

// A recipe's nutrition as a job: done while the request waits, or handed
// over, with the recipe saying it's being worked out until it's in.

const USDA_KEY = "usda-test-key-1234"

/** USDA's answers are held while a test has the gate closed. */
let release: (() => void) | null = null
let gate: Promise<void> = Promise.resolve()
const holdUsda = () => {
  gate = new Promise<void>((resolve) => {
    release = resolve
  })
}
const releaseUsda = () => release?.()

const fetcher: Fetcher = async (url) => {
  await gate
  const food = {
    fdcId: Number(url.split("/").at(-1)),
    description: "Some food, raw",
    dataType: "SR Legacy",
    foodNutrients: [
      { nutrient: { id: 1008 }, amount: 121 },
      { nutrient: { id: 1003 }, amount: 20 },
    ],
    foodPortions: [],
  }
  return {
    url,
    status: 200,
    contentType: "application/json",
    body: Buffer.from(JSON.stringify(food)),
  }
}

let database: Database
let close: () => Promise<void>
let jobs: JobRunner
let settings: Settings
let home: string
let userId: string
let kyle: TestClient
let recipeId: string

/** A recipe of its own, so what an earlier test kept of USDA's foods doesn't answer for it. */
async function addRecipe(name: string, ingredient: string) {
  const res = await kyle.post("/api/recipes", {
    name,
    servings: 2,
    ingredients: [ingredient],
    steps: ["Cook it."],
  })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()).id as string
}

beforeAll(async () => {
  const test = await createTestApp({ fetcher })
  ;({ database, close, jobs, settings } = test)
  kyle = await setUpServer(test.app, test.setupCode)
  home = (await (await kyle.get("/api/households/current")).json()).id
  userId = (await (await kyle.get("/api/auth/me")).json()).id
  const recipe = await kyle.post("/api/recipes", {
    name: "Roast Thighs",
    servings: 4,
    ingredients: ["2 lb chicken thighs"],
    steps: ["Roast them."],
  })
  recipeId = (await recipe.json()).id
  // After the recipe, so saving it didn't start its own nutrition.
  const saved = await kyle.patch("/api/settings/server", {
    "nutrition.usdaKey": USDA_KEY,
  })
  expect(saved.status, await saved.clone().text()).toBe(200)
})

afterAll(() => close())

const em = () => forHousehold(database.em, home)

const deps = () => ({ jobs, settings, fetcher, ai: undefined as never })

const workOut = (handoverMs: number, recipe = recipeId) =>
  workOutNutritionNow(
    deps(),
    em(),
    { householdId: home, userId, recipe },
    { handoverMs }
  )

describe("working out nutrition now", () => {
  test("that takes longer hands over, and the recipe says it's being worked out", async () => {
    holdUsda()
    const result = await workOut(50)
    expect("started" in result).toBe(true)

    const before = await loadRecipe(em(), recipeId)
    expect(before.working).toEqual(["nutrition"])
    expect(before.nutrition).toBeNull()

    releaseUsda()
    await jobs.drain()
    const after = await loadRecipe(em(), recipeId)
    expect(after.working).toEqual([])
    expect(after.nutrition).toMatchObject({ source: "calculated", servings: 4 })
  })

  test("pressing it again while it's going joins the same job", async () => {
    const oily = await addRecipe("Oil Dressing", "100 g olive oil")
    holdUsda()
    const first = await workOut(50, oily)
    const second = await workOut(50, oily)
    expect("started" in first && "started" in second).toBe(true)
    if (!("started" in first) || !("started" in second)) return
    expect(second.started.id).toBe(first.started.id)
    // Two presses, one job.
    expect(
      await em().count(Job, {
        key: `recipes.workOutNutrition:${oily}`,
        status: { $in: [...ACTIVE] },
      })
    ).toBe(1)

    releaseUsda()
    await jobs.drain()
  })

  test("worked out within the wait answers with the recipe", async () => {
    holdUsda()
    releaseUsda()
    const result = await workOut(5000)
    expect(result).toMatchObject({
      done: { name: "Roast Thighs", working: [] },
    })
  })

  test("what can't be worked out fails at once, with no job made", async () => {
    const jobsBefore = await em().count(Job, {
      kind: "recipes.workOutNutrition",
    })
    const removed = await kyle.patch("/api/settings/server", {
      "nutrition.usdaKey": null,
    })
    expect(removed.status, await removed.clone().text()).toBe(200)
    await expect(workOut(50)).rejects.toMatchObject({
      code: "nutrition_unavailable",
    })
    expect(await em().count(Job, { kind: "recipes.workOutNutrition" })).toBe(
      jobsBefore
    )
  })

  test("nutrition a save queues counts as being worked out until it's done", async () => {
    // The key the test before removed, so saving queues the job.
    const restored = await kyle.patch("/api/settings/server", {
      "nutrition.usdaKey": USDA_KEY,
    })
    expect(restored.status, await restored.clone().text()).toBe(200)
    holdUsda()
    const id = await addRecipe("Saved Lemons", "100 g lemon")
    expect((await loadRecipe(em(), id)).working).toEqual(["nutrition"])

    releaseUsda()
    await jobs.drain()
    expect((await loadRecipe(em(), id)).working).toEqual([])
  })
})
