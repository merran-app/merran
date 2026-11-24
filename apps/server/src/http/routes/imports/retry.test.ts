import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { AppError } from "../../../core/errors.ts"
import type { Database } from "../../../database/orm.ts"
import { forHousehold } from "../../../database/scope.ts"
import type { Fetcher } from "../../../services/fetch/public-fetch.ts"
import {
  addItem,
  createImport,
  finishImport,
} from "../../../services/imports/imports.ts"
import type { ImportKind } from "../../../database/entities/index.ts"
import type { JobRunner } from "../../../services/jobs/runner.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../test/app.ts"

// Try again: a new import of just what didn't come in.

const recipePage = (name: string) =>
  `<!doctype html><html><head><title>${name}</title>
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name,
    recipeIngredient: ["1 onion"],
    recipeInstructions: [{ "@type": "HowToStep", text: "Cook it." }],
  })}</script></head><body></body></html>`

/** The sites up for now; a test brings one up later. */
const PAGES: Record<string, string> = {
  "https://example.com/soup": recipePage("Tomato Soup"),
}

const fetcher: Fetcher = async (url) => {
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

/** A finished import of another app, with one recipe that didn't come in. */
async function appImport(kind: ImportKind, retry: Record<string, unknown>) {
  const em = forHousehold(database.em, home)
  const id = randomUUID()
  createImport(em, {
    id,
    householdId: home,
    kind,
    source: null,
    createdBy: null,
    listed: true,
    retry,
  })
  await em.flush()
  await addItem(em, id, {
    label: "Broken Pie",
    ref: "mealie:broken",
    state: "failed",
    error: "Mealie answered with an error (500).",
  })
  await finishImport(em, id, { status: "done" })
  return id
}

const retry = (who: TestClient, id: string, body: object = {}) =>
  who.post(`/api/imports/${id}/retry`, body)

describe("trying an import again", () => {
  test("imports just the links that didn't come in", async () => {
    const res = await kyle.post("/api/recipes/import/links", {
      urls: ["https://example.com/soup", "https://example.com/stew"],
      tag: "to try",
    })
    const { id } = await res.json()
    await jobs.drain()

    PAGES["https://example.com/stew"] = recipePage("Bean Stew")
    const again = await retry(kyle, id)
    expect(again.status).toBe(202)
    const started = await again.json()
    expect(started.id).not.toBe(id)
    await jobs.drain()

    const detail = await (await kyle.get(`/api/imports/${started.id}`)).json()
    expect(detail).toMatchObject({ kind: "links", tag: "to try", added: 1 })
    expect(detail.items).toMatchObject([
      { label: "https://example.com/stew", state: "added" },
    ])
  })

  test("says to upload a file again once it's gone", async () => {
    const id = await appImport("mealie", {
      from: "file",
      file: "/nowhere/gone.zip",
      group: null,
    })
    const res = await retry(kyle, id)
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe("import_file_gone")
  })

  test("only lets a household admin try a file again", async () => {
    const id = await appImport("paprika", {
      from: "file",
      file: "/nowhere/gone.zip",
      group: null,
    })
    expect((await retry(jamie, id)).status).toBe(403)
  })

  test("asks for Mealie's token again", async () => {
    const id = await appImport("mealie", {
      from: "mealie",
      url: "https://mealie.example",
    })
    const res = await retry(kyle, id)
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("mealie_token_needed")

    const again = await retry(kyle, id, { token: "a-new-token" })
    expect(again.status).toBe(202)
    expect(await again.json()).toMatchObject({
      kind: "mealie",
      source: "https://mealie.example",
      status: "queued",
    })
  })

  test("needs something that didn't come in", async () => {
    const res = await kyle.post("/api/recipes/import/links", {
      urls: ["https://example.com/soup"],
    })
    const { id } = await res.json()
    await jobs.drain()
    const again = await retry(kyle, id)
    expect(again.status).toBe(409)
    expect((await again.json()).error.code).toBe("import_nothing_to_retry")
  })
})
