import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { AppError } from "../../../core/errors.ts"
import { Import, ImportItem } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { forHousehold } from "../../../database/scope.ts"
import type { JobRunner } from "../../jobs/runner.ts"
import type { Settings } from "../../settings/settings.ts"
import type { Fetcher } from "../../fetch/public-fetch.ts"
import { createTestApp, setUpServer } from "../../../test/app.ts"
import { importOne } from "./import-one.ts"

// One link as a job: done while the request waits, or handed over.

const page = (name: string) =>
  `<!doctype html><html><head><title>${name}</title>
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name,
    recipeIngredient: ["1 onion"],
    recipeInstructions: [{ "@type": "HowToStep", text: "Cook it." }],
  })}</script></head><body></body></html>`

/** Links held until a test lets them answer. */
const held = new Map<string, () => void>()

const fetcher: Fetcher = async (url) => {
  if (url.endsWith("/slow")) {
    await new Promise<void>((resolve) => held.set(url, resolve))
  }
  if (url.includes("nowhere")) {
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
    body: Buffer.from(page(url.endsWith("/slow") ? "Slow Stew" : "Quick Soup")),
  }
}

let database: Database
let close: () => Promise<void>
let jobs: JobRunner
let settings: Settings
let home: string
let userId: string

beforeAll(async () => {
  const test = await createTestApp({ fetcher })
  ;({ database, close, jobs, settings } = test)
  const kyle = await setUpServer(test.app, test.setupCode)
  home = (await (await kyle.get("/api/households/current")).json()).id
  userId = (await (await kyle.get("/api/auth/me")).json()).id
})

afterAll(() => close())

const em = () => forHousehold(database.em, home)

/** What importOne needs here: no video link reaches the rest. */
const deps = () => ({
  jobs,
  settings,
  fetcher,
  ai: undefined as never,
  video: undefined as never,
})

describe("one link", () => {
  test("that comes in quickly opens as before, leaving no record", async () => {
    const result = await importOne(em(), deps(), {
      householdId: home,
      userId,
      url: "https://example.com/quick",
    })
    expect(result).toMatchObject({
      done: { duplicate: false, recipe: { name: "Quick Soup" } },
    })
    expect(await em().count(Import, { kind: "link" })).toBe(0)
  })

  test("already in the recipes says so at once", async () => {
    const result = await importOne(em(), deps(), {
      householdId: home,
      userId,
      url: "https://example.com/quick",
    })
    expect(result).toMatchObject({ done: { duplicate: true } })
  })

  test("that didn't come in says why, as before", async () => {
    await expect(
      importOne(em(), deps(), {
        householdId: home,
        userId,
        url: "https://nowhere.example/pie",
      })
    ).rejects.toMatchObject({ code: "site_unreachable" })
  })

  test("that takes longer than the wait goes on in the background, listed", async () => {
    const result = await importOne(
      em(),
      deps(),
      { householdId: home, userId, url: "https://example.com/slow" },
      { handoverMs: 50 }
    )
    expect("started" in result).toBe(true)
    const id = (result as { started: Import }).started.id
    expect(
      await em().findOneOrFail(Import, { id }, { refresh: true })
    ).toMatchObject({ kind: "link", listed: true })

    // It comes in after the request gave up: the record ends listed and done.
    await expect.poll(() => held.has("https://example.com/slow")).toBe(true)
    held.get("https://example.com/slow")!()
    await jobs.drain()
    expect(
      await em().findOneOrFail(Import, { id }, { refresh: true })
    ).toMatchObject({ listed: true, status: "done", added: 1 })
    const [item] = await em().find(ImportItem, { import: id })
    expect(item).toMatchObject({ state: "added" })
  })
})
