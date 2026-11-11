import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../app.ts"
import { WebhookEvent } from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { forHousehold } from "../../database/scope.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  type TestClient,
} from "../../test/app.ts"
import type { JobRunner } from "../jobs/runner.ts"

let app: App
let database: Database
let jobs: JobRunner
let close: () => Promise<void>
let kyle: TestClient
let home: string

beforeAll(async () => {
  const test = await createTestApp({ publicUrl: "http://merran.test" })
  ;({ app, database, jobs, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  home = (await (await kyle.get("/api/households/current")).json()).id
  // Nothing is delivered: the events recorded are what's read.
  expect(
    (
      await kyle.patch("/api/settings/server", {
        "webhooks.homeNetwork": "all",
      })
    ).status
  ).toBe(200)
  const res = await kyle.post("/api/households/current/webhooks", {
    name: "All",
    address: "http://127.0.0.1:9/h",
    events: [],
    everything: true,
    headers: [],
  })
  expect(res.status).toBe(201)
})

afterAll(() => close())

const LEMON_CHICKEN = {
  name: "Lemon Chicken",
  servings: 4,
  tags: ["Dinner"],
  ingredients: ["4 chicken thighs", "1 lemon"],
  steps: ["Roast the chicken.", "Squeeze the lemon over it."],
}

/** Everything recorded so far, oldest first, as the webhook would send it. */
async function events(type?: string) {
  const rows = await forHousehold(database.em, home).find(
    WebhookEvent,
    type ? { type } : {},
    { orderBy: { id: "asc" } }
  )
  return rows.map((row) => ({ type: row.type, ...row.payload }))
}

/** The events recorded by doing something. */
async function eventsFrom(action: () => Promise<unknown>) {
  const before = (await events()).length
  await action()
  return (await events()).slice(before) as Record<string, any>[]
}

async function addRecipe(recipe: Record<string, unknown>) {
  const res = await kyle.post("/api/recipes", recipe)
  expect(res.status).toBe(201)
  return res.json()
}

const tinyPhoto = () =>
  sharp({
    create: { width: 40, height: 30, channels: 3, background: "#c63" },
  })
    .png()
    .toBuffer()

describe("adding a recipe", () => {
  test("adding a recipe tells webhooks who did it", async () => {
    const [event, ...others] = await eventsFrom(() => addRecipe(LEMON_CHICKEN))

    expect(others).toEqual([])
    expect(event).toMatchObject({
      type: "recipe.created",
      recipe: {
        title: "Lemon Chicken",
        slug: "lemon-chicken",
        url: "http://merran.test/recipes/lemon-chicken",
      },
      origin: "manual",
      sourceUrl: null,
      by: { name: "Kyle" },
      via: "app",
      key: null,
    })
  })

  test("through an API key, the key is named", async () => {
    const created = await kyle.post("/api/auth/api-keys", {
      name: "n8n",
      permissions: { recipes: "write" },
      expiresInDays: 30,
    })
    const { key } = await created.json()

    const [event] = await eventsFrom(async () => {
      const res = await app.request(`${TEST_ORIGIN}/api/recipes`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ...LEMON_CHICKEN, name: "Pesto Pasta" }),
      })
      expect(res.status).toBe(201)
    })

    expect(event).toMatchObject({
      type: "recipe.created",
      via: "api",
      key: { name: "n8n" },
    })
  })
})

describe("editing a recipe", () => {
  const put = (slug: string, changes: Record<string, unknown>) =>
    kyle.put(`/api/recipes/${slug}`, { ...LEMON_CHICKEN, ...changes })

  test("edits say which parts changed", async () => {
    const recipe = await addRecipe({ ...LEMON_CHICKEN, name: "Edited" })

    const [steps] = await eventsFrom(() =>
      put(recipe.slug, {
        name: "Edited",
        steps: ["Roast the chicken.", "Rest it.", "Squeeze the lemon."],
      })
    )
    expect(steps).toMatchObject({
      type: "recipe.updated",
      recipe: { slug: recipe.slug },
      parts: ["steps"],
    })

    const [renamed] = await eventsFrom(() =>
      put(recipe.slug, {
        name: "Edited again",
        tags: ["Dinner", "Weeknight"],
        steps: ["Roast the chicken.", "Rest it.", "Squeeze the lemon."],
      })
    )
    expect(renamed).toMatchObject({
      recipe: { title: "Edited again" },
      parts: ["details", "tags"],
    })
  })

  test("an edit that changes nothing sends nothing", async () => {
    const recipe = await addRecipe({ ...LEMON_CHICKEN, name: "Steady" })
    const change = { name: "Steady", servings: 6 }

    const first = await eventsFrom(() => put(recipe.slug, change))
    const second = await eventsFrom(() => put(recipe.slug, change))

    expect(first.map((event) => event.parts)).toEqual([["details"]])
    expect(second).toEqual([])
  })

  test("restoring a version, a photo and diets are updates", async () => {
    const recipe = await addRecipe({ ...LEMON_CHICKEN, name: "Versions" })
    await put(recipe.slug, {
      name: "Versions",
      ingredients: ["4 chicken thighs"],
    })
    const [version] = await (
      await kyle.get(`/api/recipes/${recipe.slug}/versions`)
    ).json()

    const [restored] = await eventsFrom(() =>
      kyle.post(`/api/recipes/${recipe.slug}/versions/${version.id}/restore`)
    )
    expect(restored).toMatchObject({
      type: "recipe.updated",
      parts: ["ingredients"],
    })

    const [photo] = await eventsFrom(async () => {
      const res = await kyle.upload(
        `/api/recipes/${recipe.slug}/photo`,
        await tinyPhoto(),
        "image/png"
      )
      expect(res.status).toBe(200)
    })
    expect(photo).toMatchObject({ type: "recipe.updated", parts: ["photo"] })

    const [diets] = await eventsFrom(async () => {
      const res = await kyle.put(`/api/recipes/${recipe.slug}/diets`, {
        overrides: { vegan: true },
      })
      expect(res.status).toBe(200)
    })
    expect(diets).toMatchObject({ type: "recipe.updated", parts: ["diets"] })
  })
})

describe("setters that change nothing", () => {
  test("clearing a photo that isn't there sends nothing", async () => {
    const recipe = await addRecipe({ ...LEMON_CHICKEN, name: "No photo" })

    const sent = await eventsFrom(async () => {
      const res = await kyle.delete(`/api/recipes/${recipe.slug}/photo`)
      expect(res.status).toBe(200)
    })

    expect(sent).toEqual([])
  })

  test("the same diets twice send one update", async () => {
    const recipe = await addRecipe({ ...LEMON_CHICKEN, name: "Same diets" })
    // Two corrections, which Postgres keeps in its own order.
    const setDiets = async () => {
      const res = await kyle.put(`/api/recipes/${recipe.slug}/diets`, {
        overrides: { vegetarian: true, vegan: true },
      })
      expect(res.status).toBe(200)
    }

    const first = await eventsFrom(setDiets)
    const second = await eventsFrom(setDiets)

    expect(first.map((event) => event.parts)).toEqual([["diets"]])
    expect(second).toEqual([])
  })

  test("the same needs twice send one update", async () => {
    const recipe = await addRecipe({ ...LEMON_CHICKEN, name: "Same needs" })
    const setNeeds = (foods: string[]) => async () => {
      const res = await kyle.put(`/api/recipes/${recipe.slug}/needs`, {
        foods,
      })
      expect(res.status).toBe(200)
    }

    const first = await eventsFrom(setNeeds(["chicken", "lemon"]))
    const second = await eventsFrom(setNeeds(["lemon", "chicken"]))

    expect(first.map((event) => event.parts)).toEqual([["ingredients"]])
    expect(second).toEqual([])
  })
})

describe("deleting and restoring", () => {
  test("deleting and restoring", async () => {
    const recipe = await addRecipe({ ...LEMON_CHICKEN, name: "Gone" })

    const [deleted] = await eventsFrom(async () => {
      expect((await kyle.delete(`/api/recipes/${recipe.slug}`)).status).toBe(
        204
      )
    })
    expect(deleted).toMatchObject({
      type: "recipe.deleted",
      recipe: { slug: recipe.slug, title: "Gone" },
    })

    const [restored] = await eventsFrom(async () => {
      const res = await kyle.post(`/api/recipes/deleted/${recipe.id}/restore`)
      expect(res.status).toBe(200)
    })
    expect(restored).toMatchObject({
      type: "recipe.restored",
      recipe: { slug: recipe.slug },
    })

    // Put back by the bulk action too.
    await kyle.delete(`/api/recipes/${recipe.slug}`)
    const [bulkRestored, ...others] = await eventsFrom(async () => {
      const res = await kyle.post("/api/recipes/deleted/bulk", {
        action: "restore",
        ids: [recipe.id],
      })
      expect(res.status).toBe(200)
    })
    expect(others).toEqual([])
    expect(bulkRestored).toMatchObject({ type: "recipe.restored" })

    // Deleting for good says nothing more.
    await kyle.delete(`/api/recipes/${recipe.slug}`)
    const forGood = await eventsFrom(async () => {
      const res = await kyle.delete(`/api/recipes/deleted/${recipe.id}`)
      expect(res.status).toBe(204)
    })
    expect(forGood).toEqual([])
  })

  test("a bulk delete tells about each recipe", async () => {
    const one = await addRecipe({ ...LEMON_CHICKEN, name: "Bulk one" })
    const two = await addRecipe({ ...LEMON_CHICKEN, name: "Bulk two" })

    const sent = await eventsFrom(async () => {
      const res = await kyle.post("/api/recipes/bulk", {
        action: "delete",
        ids: [one.id, two.id],
      })
      expect(res.status).toBe(200)
    })

    expect(sent.map((event) => [event.type, event.recipe.title])).toEqual(
      expect.arrayContaining([
        ["recipe.deleted", "Bulk one"],
        ["recipe.deleted", "Bulk two"],
      ])
    )
    expect(sent).toHaveLength(2)
  })
})

describe("what sends nothing", () => {
  test("a household archive brought in sends no recipe.created", async () => {
    const recipe = await addRecipe({ ...LEMON_CHICKEN, name: "Archived" })
    const exported = await kyle.get("/api/households/current/export")
    expect(exported.status).toBe(200)
    const zip = new Uint8Array(await exported.arrayBuffer())
    // Gone for good, so the import has to make it again.
    await kyle.delete(`/api/recipes/${recipe.slug}`)
    await kyle.delete(`/api/recipes/deleted/${recipe.id}`)

    const created = (await events("recipe.created")).length
    const res = await kyle.upload(
      "/api/households/current/import",
      zip,
      "application/zip",
      "POST"
    )
    expect(res.status).toBe(202)
    await jobs.drain()

    expect((await kyle.get("/api/recipes/archived")).status).toBe(200)
    expect((await events("recipe.created")).length).toBe(created)
  })
})
