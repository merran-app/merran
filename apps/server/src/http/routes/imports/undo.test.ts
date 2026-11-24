import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { AppError } from "../../../core/errors.ts"
import type { Fetcher } from "../../../services/fetch/public-fetch.ts"
import type { JobRunner } from "../../../services/jobs/runner.ts"
import { stopSignal } from "../../../services/jobs/stop.ts"
import { createTestApp, setUpServer, TestClient } from "../../../test/app.ts"

// Undo moves what an import brought in to Recently deleted, asking which
// to keep; Restore puts back what Undo moved.

const recipePage = (name: string) =>
  `<!doctype html><html><head><title>${name}</title>
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name,
    recipeIngredient: ["1 onion"],
    recipeInstructions: [{ "@type": "HowToStep", text: "Cook it." }],
  })}</script></head><body></body></html>`

const NAMES = [
  "Apple",
  "Bean",
  "Carrot",
  "Date",
  "Egg",
  "Fig",
  "Grape",
  "Ham",
  "Iced",
]
const PAGES = Object.fromEntries(
  NAMES.map((name) => [
    `https://example.com/${name.toLowerCase()}`,
    recipePage(`${name} Soup`),
  ])
)
const link = (name: string) => `https://example.com/${name.toLowerCase()}`
const slug = (name: string) => `${name.toLowerCase()}-soup`

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
let jobs: JobRunner
let kyle: TestClient

beforeAll(async () => {
  const test = await createTestApp({ fetcher })
  ;({ app, close, jobs } = test)
  kyle = await setUpServer(app, test.setupCode)
})

afterAll(() => close())

/** Imports the links, waits for it, and says each recipe's id by name. */
async function imported(names: string[]) {
  const res = await kyle.post("/api/recipes/import/links", {
    urls: names.map(link),
  })
  const { id } = await res.json()
  await jobs.drain()
  const ids: Record<string, string> = {}
  for (const name of names) {
    ids[name] = (await (await kyle.get(`/api/recipes/${slug(name)}`)).json()).id
  }
  return { id: id as string, ids }
}

/** Undoes an import, keeping the recipes given. */
const undo = (id: string, keep: string[] = []) =>
  kyle.post(`/api/imports/${id}/undo`, { keep })

const inRecentlyDeleted = async () =>
  (await (await kyle.get("/api/recipes/deleted")).json()).map(
    (recipe: { slug: string }) => recipe.slug
  )

describe("undoing an import", () => {
  test("moves what it brought in to Recently deleted, keeping the ones unticked", async () => {
    const { id, ids } = await imported(["Apple", "Bean", "Carrot"])
    const res = await undo(id, [ids.Carrot!])
    expect(res.status).toBe(200)
    // It says how many went, not how many came in.
    expect(await res.json()).toMatchObject({ status: "undone", undone: 2 })

    expect(await inRecentlyDeleted()).toEqual(
      expect.arrayContaining([slug("Apple"), slug("Bean")])
    )
    expect((await kyle.get(`/api/recipes/${slug("Carrot")}`)).status).toBe(200)
  })

  test("never touches recipes it didn't bring in", async () => {
    const { id } = await imported(["Date"])
    await kyle.post("/api/recipes", {
      name: "My Own Stew",
      ingredients: ["1 potato"],
      steps: ["Stew it."],
    })
    // Keeping none: still only what it brought in goes.
    await undo(id)
    expect((await kyle.get("/api/recipes/my-own-stew")).status).toBe(200)
  })

  test("skips a recipe already in Recently deleted, and one deleted for good", async () => {
    const { id, ids } = await imported(["Egg", "Fig", "Grape"])
    await kyle.delete(`/api/recipes/${slug("Egg")}`)
    await kyle.delete(`/api/recipes/${slug("Fig")}`)
    await kyle.delete(`/api/recipes/deleted/${ids.Fig}`)

    const res = await undo(id)
    expect(res.status).toBe(200)
    // Only Grape went: Egg was there already, and Fig is gone.
    expect(await res.json()).toMatchObject({ undone: 1 })
    expect(await inRecentlyDeleted()).toEqual(
      expect.arrayContaining([slug("Egg"), slug("Grape")])
    )

    // Restore brings back what Undo moved, not what was deleted before it.
    const restored = await kyle.post(`/api/imports/${id}/restore`)
    expect(restored.status).toBe(200)
    expect(await restored.json()).toMatchObject({ status: "done", undone: 0 })
    expect((await kyle.get(`/api/recipes/${slug("Grape")}`)).status).toBe(200)
    expect(await inRecentlyDeleted()).toContain(slug("Egg"))
  })

  test("stops an import that's running first", async () => {
    const res = await kyle.post("/api/recipes/import/links", {
      urls: [link("Ham"), SLOW],
    })
    const { id } = await res.json()
    const draining = jobs.drain()
    await expect
      .poll(async () => (await kyle.get(`/api/recipes/${slug("Ham")}`)).status)
      .toBe(200)

    const undone = await undo(id)
    expect(undone.status).toBe(200)
    await draining
    expect(await undone.json()).toMatchObject({ status: "undone" })
    expect(await inRecentlyDeleted()).toContain(slug("Ham"))
  })

  test("restore after a recipe was emptied from Recently deleted brings back the rest", async () => {
    const { id, ids } = await imported(["Iced"])
    await undo(id)
    await kyle.delete(`/api/recipes/deleted/${ids.Iced}`)

    const restored = await kyle.post(`/api/imports/${id}/restore`)
    expect(restored.status).toBe(200)
    expect(await restored.json()).toMatchObject({ status: "done" })
    expect((await kyle.get(`/api/recipes/${slug("Iced")}`)).status).toBe(404)
  })

  test("restore needs an import that was undone", async () => {
    const { id } = await imported(["Bean"])
    expect((await kyle.post(`/api/imports/${id}/restore`)).status).toBe(409)
  })
})
