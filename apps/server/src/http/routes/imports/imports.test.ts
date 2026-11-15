import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { AppError } from "../../../core/errors.ts"
import { Import, Recipe } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { forHousehold } from "../../../database/scope.ts"
import type { Fetcher } from "../../../services/fetch/public-fetch.ts"
import { addItem, createImport } from "../../../services/imports/imports.ts"
import type { JobRunner } from "../../../services/jobs/runner.ts"
import { stopSignal } from "../../../services/jobs/stop.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../test/app.ts"

// The Imports page's API: every import a household made, and what came of
// each link or recipe.

const recipePage = (name: string) =>
  `<!doctype html><html><head><title>${name}</title>
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name,
    recipeIngredient: ["1 onion"],
    recipeInstructions: [{ "@type": "HowToStep", text: "Cook it." }],
  })}</script></head><body></body></html>`

const PAGES: Record<string, string> = {
  "https://example.com/soup": recipePage("Tomato Soup"),
  "https://example.com/bread": recipePage("Soda Bread"),
  "https://example.com/rice": recipePage("Garlic Rice"),
  "https://example.com/pie": recipePage("Apple Pie"),
  "https://example.com/cake": recipePage("Lemon Cake"),
}

/** A site that never answers, until the job fetching it is stopped. */
const SLOW = "https://example.com/slow"

const fetcher: Fetcher = async (url) => {
  if (url === SLOW) {
    return new Promise((_resolve, reject) => {
      const stop = stopSignal()
      stop?.addEventListener("abort", () => reject(stop.reason))
    })
  }
  const page = PAGES[url]
  if (!page) {
    throw new AppError(
      "upstream",
      "site_unreachable",
      "Couldn't reach that site."
    )
  }
  return {
    url,
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: Buffer.from(page),
  }
}

let app: App
let close: () => Promise<void>
let database: Database
let jobs: JobRunner
let kyle: TestClient
let jamie: TestClient
let home: string

beforeAll(async () => {
  const test = await createTestApp({ fetcher })
  ;({ app, close, database, jobs } = test)
  kyle = await setUpServer(app, test.setupCode)
  home = (await (await kyle.get("/api/households/current")).json()).id
  jamie = await join(app, await inviteToken(kyle), account("jamie", "Jamie"))
})

afterAll(() => close())

const startLinks = async (urls: string[]) => {
  const res = await kyle.post("/api/recipes/import/links", { urls })
  expect(res.status).toBe(202)
  return (await res.json()).id as string
}
const getImport = async (id: string, query = "") =>
  (await kyle.get(`/api/imports/${id}${query}`)).json()

describe("the Imports page", () => {
  test("lists everyone's imports to the household, newest first, but not unlisted ones", async () => {
    const first = await startLinks(["https://example.com/soup"])
    const second = await startLinks([
      "https://example.com/bread",
      "https://example.com/nowhere",
    ])
    await jobs.drain()
    // A single link that came in while someone waited isn't listed.
    const tx = forHousehold(database.em, home)
    const unlisted = randomUUID()
    createImport(tx, {
      id: unlisted,
      householdId: home,
      kind: "link",
      source: "https://example.com/rice",
      createdBy: null,
      listed: false,
    })
    await tx.flush()
    // Its own page still opens, and says it isn't listed: the app tells
    // no one it's in, since whoever started it watched it open.
    expect(await getImport(unlisted)).toMatchObject({ listed: false })
    expect(await getImport(first)).toMatchObject({ listed: true })

    const res = await jamie.get("/api/imports")
    expect(res.status).toBe(200)
    const { imports } = await res.json()
    expect(
      imports.map((found: { id: string }) => found.id).slice(0, 2)
    ).toEqual([second, first])
    expect(imports[0]).toMatchObject({
      kind: "links",
      status: "done",
      total: 2,
      done: 2,
      added: 1,
      failed: 1,
      startedBy: { name: "Kyle" },
    })
    expect(
      imports.some((found: { kind: string }) => found.kind === "link")
    ).toBe(false)
  })

  test("shows each link of an import in order, as it goes", async () => {
    const id = await startLinks([
      "https://example.com/pie",
      "https://example.com/nowhere-else",
    ])
    expect((await getImport(id)).items).toMatchObject([
      { position: 0, label: "https://example.com/pie", state: "waiting" },
      { position: 1, state: "waiting" },
    ])
    await jobs.drain()
    const done = await getImport(id)
    expect(done.items).toMatchObject([
      { state: "added", recipe: { slug: "apple-pie" }, error: null },
      { state: "failed", recipe: null, error: "Couldn't reach that site." },
    ])
    expect(done.cameIn.items).toMatchObject([
      { recipe: { slug: "apple-pie", name: "Apple Pie" } },
    ])
    expect(done.didntComeIn.items).toMatchObject([
      { label: "https://example.com/nowhere-else", error: expect.any(String) },
    ])
  })

  test("pages an app import's lists of what came in, was there and didn't", async () => {
    const tx = forHousehold(database.em, home)
    const id = randomUUID()
    createImport(tx, {
      id,
      householdId: home,
      kind: "mealie",
      source: "https://mealie.example",
      createdBy: null,
      listed: true,
    })
    const recipes = Array.from({ length: 150 }, (_, index) =>
      tx.create(Recipe, {
        household: home,
        slug: `mealie-${index}`,
        name: `Mealie ${index}`,
        origin: "mealie",
      })
    )
    await tx.flush()
    for (const recipe of recipes) {
      await addItem(tx, id, {
        label: recipe.name,
        ref: `mealie:${recipe.slug}`,
        state: "added",
        recipeId: recipe.id,
      })
    }
    for (const name of ["Broken", "Burnt", "Lost"]) {
      await addItem(tx, id, {
        label: name,
        ref: `mealie:${name}`,
        state: "failed",
        error: "Mealie answered with an error (500).",
      })
    }

    const first = await getImport(id)
    expect(first).toMatchObject({ kind: "mealie", added: 150, failed: 3 })
    expect(first.items).toEqual([])
    expect(first.cameIn.items).toHaveLength(100)
    expect(first.cameIn.more).toBe(true)
    expect(first.didntComeIn).toMatchObject({
      items: [{ label: "Broken" }, { label: "Burnt" }, { label: "Lost" }],
      more: false,
    })
    const rest = await getImport(id, "?cameIn=100")
    expect(rest.cameIn.items).toHaveLength(50)
    expect(rest.cameIn.more).toBe(false)
  })

  test("says if a recipe that came in has been changed, planned or cooked since", async () => {
    const id = await startLinks(["https://example.com/cake"])
    await jobs.drain()
    const before = await getImport(id)
    expect(before.cameIn.items[0].recipe).toMatchObject({
      changed: false,
      planned: false,
      cooked: false,
      deleted: false,
    })

    const cake = await (await kyle.get("/api/recipes/lemon-cake")).json()
    const edited = await kyle.put("/api/recipes/lemon-cake", {
      name: "Lemon Drizzle Cake",
      ingredients: ["1 lemon"],
      steps: ["Bake it."],
    })
    expect(edited.status, await edited.clone().text()).toBe(200)
    await kyle.post("/api/plan/entries", {
      date: "2026-11-20",
      meal: "dinner",
      recipeId: cake.id,
    })
    await kyle.post(`/api/recipes/${cake.slug}/made`, {})
    await kyle.delete(`/api/recipes/${cake.slug}`)

    const after = await getImport(id)
    expect(after.cameIn.items[0].recipe).toMatchObject({
      changed: true,
      planned: true,
      cooked: true,
      deleted: true,
    })
  })

  test("can stop an import, keeping what came in", async () => {
    const id = await startLinks(["https://example.com/rice", SLOW])
    const draining = jobs.drain()
    await expect
      .poll(async () => (await getImport(id)).items[0].state)
      .toBe("added")
    const res = await kyle.post(`/api/imports/${id}/stop`)
    expect(res.status).toBe(200)
    await draining

    const stopped = await getImport(id)
    expect(stopped).toMatchObject({ status: "cancelled", added: 1, stopped: 1 })
    expect(stopped.cameIn.items).toHaveLength(1)
    expect((await kyle.post(`/api/imports/${id}/stop`)).status).toBe(409)
  })

  test("deleting a record keeps its recipes", async () => {
    const id = await startLinks(["https://example.com/soup"])
    await jobs.drain()
    const res = await kyle.delete(`/api/imports/${id}`)
    expect(res.status).toBe(204)
    expect((await kyle.get(`/api/imports/${id}`)).status).toBe(404)
    expect((await kyle.get("/api/recipes/tomato-soup")).status).toBe(200)
  })

  test("never shows another household's import", async () => {
    const tx = database.em.fork()
    const other = randomUUID()
    const cabin = (
      await (await kyle.post("/api/households", { name: "Cabin" })).json()
    ).id
    await kyle.post("/api/auth/organization/set-active", {
      organizationId: home,
    })
    const cabinEm = forHousehold(database.em, cabin)
    createImport(cabinEm, {
      id: other,
      householdId: cabin,
      kind: "links",
      source: null,
      createdBy: null,
      listed: true,
    })
    await cabinEm.flush()
    expect((await kyle.get(`/api/imports/${other}`)).status).toBe(404)
    const { imports } = await (await kyle.get("/api/imports")).json()
    expect(imports.some((found: { id: string }) => found.id === other)).toBe(
      false
    )
    expect(await tx.count(Import, { id: other }, { filters: false })).toBe(1)
  })

  test("replaces the routes that only followed several links", async () => {
    const id = await startLinks(["https://example.com/soup"])
    await jobs.drain()
    expect((await kyle.get("/api/recipes/import/links")).status).toBe(404)
    expect((await kyle.get(`/api/recipes/import/links/${id}`)).status).toBe(404)
    expect(
      (await kyle.post(`/api/recipes/import/links/${id}/stop`)).status
    ).toBe(404)
  })

  test("needs imports:read for an API key", async () => {
    const keyFor = async (permissions: object) =>
      (
        await (
          await kyle.post("/api/auth/api-keys", {
            name: "Imports",
            permissions,
            expiresInDays: 30,
          })
        ).json()
      ).key as string
    const listWith = (key: string) =>
      app.request(`${TEST_ORIGIN}/api/imports`, {
        headers: { authorization: `Bearer ${key}` },
      })
    expect((await listWith(await keyFor({ list: "read" }))).status).toBe(403)
    expect((await listWith(await keyFor({ imports: "read" }))).status).toBe(200)
  })
})
