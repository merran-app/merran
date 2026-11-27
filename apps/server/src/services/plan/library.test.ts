import { lineFoods } from "@merran/shared"
import { afterAll, beforeAll, expect, test } from "vitest"
import type { App } from "../../app.ts"
import type { Database } from "../../database/orm.ts"
import { forHousehold } from "../../database/scope.ts"
import { createTestApp, setUpServer, TestClient } from "../../test/app.ts"
import { loadPlanningLibrary, type PlanningLibrary } from "./library.ts"
import { suggestMeals } from "./suggest.ts"

let app: App
let database: Database
let close: () => Promise<void>
let kyle: TestClient
let householdId: string

async function addRecipe(name: string, tags: string[], ingredients: string[]) {
  const res = await kyle.post("/api/recipes", {
    name,
    tags,
    ingredients,
    servings: 4,
    steps: ["Cook it."],
  })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as { id: string; slug: string }
}

const scoped = () => forHousehold(database.em.fork(), householdId)

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, database, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  householdId = (await (await kyle.get("/api/households/current")).json()).id
})

afterAll(async () => {
  await close()
})

test("the planning library has each recipe's tags and lines, in order, with their foods", async () => {
  const added = await addRecipe(
    "Rice Bowl",
    ["quick"],
    ["1 onion", "2 cups rice"]
  )
  const library = await loadPlanningLibrary(scoped())
  const recipe = library.recipes.find((one) => one.id === added.id)!
  expect(recipe.tags).toEqual(["quick"])
  expect(recipe.lines.map((line) => line.rawText)).toEqual([
    "1 onion",
    "2 cups rice",
  ])
  expect(recipe.lines[0]!.foods.map((food) => food.key)).toEqual(
    lineFoods("1 onion").map((food) => food.key)
  )
})

test("recently deleted recipes aren't in it", async () => {
  const gone = await addRecipe("Soon Gone", [], ["1 egg"])
  const kept = await addRecipe("Staying", [], ["1 egg"])
  expect((await kyle.delete(`/api/recipes/${gone.slug}`)).status).toBe(204)
  const ids = (await loadPlanningLibrary(scoped())).recipes.map(
    (recipe) => recipe.id
  )
  expect(ids).toContain(kept.id)
  expect(ids).not.toContain(gone.id)
})

test("suggestions come from the library they're given", async () => {
  const library: PlanningLibrary = {
    recipes: [
      {
        id: "made-up",
        slug: "made-up",
        name: "Made-up Stew",
        image: null,
        servings: 4,
        totalMinutes: 30,
        rating: null,
        lastMadeAt: null,
        diets: [],
        needs: [],
        tags: [],
        lines: [
          { rawText: "1 carrot", mark: null, foods: lineFoods("1 carrot") },
        ],
      },
    ],
  }
  const suggestions = await suggestMeals(
    scoped(),
    householdId,
    [{ date: "2030-01-07", meal: "dinner" }],
    { library }
  )
  expect(suggestions.map((one) => one.recipe.name)).toEqual(["Made-up Stew"])
})
