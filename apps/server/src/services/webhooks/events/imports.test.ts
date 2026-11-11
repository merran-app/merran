import { afterAll, beforeAll, describe, expect, test } from "vitest"
import yazl from "yazl"
import type { App } from "../../../app.ts"
import { AppError } from "../../../core/errors.ts"
import { SiteRecipe } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  type TestClient,
} from "../../../test/app.ts"
import {
  eventsFrom,
  listenToEverything,
  sentEvents,
} from "../../../test/webhooks.ts"
import type { Fetcher } from "../../fetch/public-fetch.ts"
import type { JobRunner } from "../../jobs/runner.ts"

// import.finished: said once when an import runs to its end, with what it
// brought in. One that's stopped says nothing.

const recipePage = (name: string, ingredient: string) =>
  `<!doctype html><html><head><title>${name}</title>
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name,
    recipeIngredient: [ingredient],
    recipeInstructions: [{ "@type": "HowToStep", text: "Cook it." }],
  })}</script></head><body></body></html>`

const PAGES: Record<string, string> = {
  "https://example.com/soup": recipePage("Tomato Soup", "2 cans tomatoes"),
  "https://example.com/bread": recipePage("Soda Bread", "500 g flour"),
  "https://example.com/rice": recipePage("Garlic Rice", "1 cup rice"),
  "https://example.com/blog": "<html><body>Ten kitchen tips</body></html>",
  "https://soups.example/tomato-soup": recipePage("Tomato Soup", "1 onion"),
  "https://soups.example/corn-chowder": recipePage("Corn Chowder", "1 onion"),
  "https://soups.example/pea-soup": recipePage("Pea Soup", "1 onion"),
  "https://soups.example/bean-soup": recipePage("Bean Soup", "1 onion"),
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
let database: Database
let jobs: JobRunner
let close: () => Promise<void>
let kyle: TestClient
let home: string

beforeAll(async () => {
  const test = await createTestApp({ fetcher })
  ;({ app, database, jobs, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  home = (await (await kyle.get("/api/households/current")).json()).id
  await listenToEverything(kyle)
})

afterAll(() => close())

const startLinks = async (urls: string[]) => {
  const res = await kyle.post("/api/recipes/import/links", { urls })
  expect(res.status).toBe(202)
  return res.json()
}

/** The import.finished events among what an action sent. */
const finishedBy = async (action: () => Promise<unknown>) =>
  (await eventsFrom(database, home, action)).filter(
    (event) => event.type === "import.finished"
  )

describe("a batch of links", () => {
  test("says how it went", async () => {
    // In the library already, so the batch skips it.
    await startLinks(["https://example.com/rice"])
    await jobs.drain()

    let started: { id: string } | undefined
    const sent = await finishedBy(async () => {
      started = await startLinks([
        "https://example.com/soup",
        "https://example.com/rice",
        "https://example.com/blog",
      ])
      await jobs.drain()
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      import: { id: started!.id },
      kind: "links",
      app: null,
      added: 1,
      skipped: 1,
      failed: 1,
      by: null,
      via: "merran",
      url: `${TEST_ORIGIN}/recipes/import/${started!.id}`,
    })
  })

  test("shared together is still a batch of links", async () => {
    const sent = await finishedBy(async () => {
      const res = await kyle.post("/api/share", {
        text: "https://example.com/bread\nhttps://example.com/soup",
      })
      expect(res.status).toBe(202)
      await jobs.drain()
    })
    expect(sent).toMatchObject([
      { kind: "links", added: 1, skipped: 1, failed: 0 },
    ])
  })

  test("a stopped batch sends nothing", async () => {
    const started = await startLinks([
      "https://soups.example/tomato-soup",
      "https://soups.example/pea-soup",
    ])
    const sent = await finishedBy(async () => {
      const res = await kyle.post(
        `/api/recipes/import/links/${started.id}/stop`
      )
      expect(res.status).toBe(200)
      await jobs.drain()
    })
    expect(sent).toEqual([])
  })
})

describe("a collection", () => {
  test("an import says it's a collection", async () => {
    const em = database.em.fork()
    for (const name of [
      "Tomato Soup",
      "Corn Chowder",
      "Pea Soup",
      "Bean Soup",
    ]) {
      em.create(SiteRecipe, {
        url: `https://soups.example/${name.toLowerCase().replace(/\W+/g, "-")}`,
        state: "recipe",
        siteName: "Soups Example",
        name,
        courses: ["soup"],
        keywords: [],
        ingredients: ["1 onion", "4 cups stock"],
        diets: [],
        publishedAt: new Date(),
      })
    }
    await em.flush()

    let started: { id: string } | undefined
    const sent = await finishedBy(async () => {
      const res = await kyle.post("/api/collections/soups/import")
      expect(res.status).toBe(202)
      started = await res.json()
      await jobs.drain()
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      import: { id: started!.id },
      kind: "collection",
      app: null,
    })
  })
})

function zipOf(files: Record<string, string>) {
  const zip = new yazl.ZipFile()
  for (const [name, content] of Object.entries(files)) {
    zip.addBuffer(Buffer.from(content), name)
  }
  zip.end()
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = []
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk))
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)))
    zip.outputStream.on("error", reject)
  })
}

const GROUP = "0f0e0d0c0b0a49088f7e6d5c4b3a2918"
const SOUP = "945c1294d8a84f91a09114854680dc6e"
const BREAD = "a45c1294d8a84f91a09114854680dc6f"

/** A Mealie backup with two recipes, as its backups are made. */
const mealieBackup = () =>
  zipOf({
    "database.json": JSON.stringify({
      alembic_version: [{ version_num: "7cf3054cbbcc" }],
      groups: [{ id: GROUP, name: "Home", slug: "home" }],
      users: [],
      recipes: [
        {
          id: SOUP,
          group_id: GROUP,
          name: "Mealie Soup",
          slug: "mealie-soup",
          created_at: "2023-06-01T09:30:00",
        },
        {
          id: BREAD,
          group_id: GROUP,
          name: "Mealie Bread",
          slug: "mealie-bread",
          created_at: "2023-07-01T09:30:00",
        },
      ],
      recipes_ingredients: [
        { id: 1, recipe_id: SOUP, position: 0, note: "2 cans tomatoes" },
        { id: 2, recipe_id: BREAD, position: 0, note: "500 g flour" },
      ],
      recipe_instructions: [
        { id: "s1", recipe_id: SOUP, position: 0, text: "Heat it." },
        { id: "s2", recipe_id: BREAD, position: 0, text: "Bake it." },
      ],
    }),
  })

describe("another app's files", () => {
  test("an app import counts what came over", async () => {
    const checked = await kyle.upload(
      "/api/households/current/import/files",
      await mealieBackup(),
      "application/zip",
      "POST"
    )
    expect(checked.status).toBe(200)
    const file = await checked.json()

    const sent = await eventsFrom(database, home, async () => {
      const started = await kyle.post(
        `/api/households/current/import/files/${file.id}/start`,
        {}
      )
      expect(started.status).toBe(202)
      await jobs.drain()
    })

    // Nothing says each recipe was created: the import says it all.
    expect(sent.map((event) => event.type)).toEqual(["import.finished"])
    expect(sent[0]).toMatchObject({
      kind: "app",
      app: "mealie",
      added: 2,
      skipped: 0,
      failed: 0,
      by: null,
      via: "merran",
      url: `${TEST_ORIGIN}/settings/import-export`,
    })
  })
})

describe("a Merran archive", () => {
  test("counts what came over", async () => {
    const other = await createTestApp()
    try {
      const them = await setUpServer(other.app, other.setupCode)
      const made = await them.post("/api/recipes", {
        name: "Lentil Soup",
        ingredients: ["1 cup lentils"],
        steps: ["Simmer."],
      })
      expect(made.status).toBe(201)
      const exported = new Uint8Array(
        await (await them.get("/api/households/current/export")).arrayBuffer()
      )

      const sent = await eventsFrom(database, home, async () => {
        const res = await kyle.upload(
          "/api/households/current/import",
          exported,
          "application/zip",
          "POST"
        )
        expect(res.status).toBe(202)
        await jobs.drain()
      })

      expect(sent.map((event) => event.type)).toEqual(["import.finished"])
      expect(sent[0]).toMatchObject({
        kind: "archive",
        app: null,
        added: 1,
        skipped: 0,
        failed: 0,
        by: null,
        via: "merran",
        url: `${TEST_ORIGIN}/settings/import-export`,
      })
    } finally {
      await other.close()
    }
  })
})
