import { afterAll, beforeAll, expect, test } from "vitest"
import { Discovery, Job } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import type { JobRunner } from "../../../services/jobs/runner.ts"
import type { Fetcher } from "../../../services/fetch/public-fetch.ts"
import { fakeAiFetcher, GOOD_KEYS, mockAiModels } from "../../../test/ai.ts"
import { createTestApp, setUpServer, TestClient } from "../../../test/app.ts"

// Stop and Find more with a round really running: a page that's slow to
// open, which doesn't notice the stop, as a fetch doesn't.

const PAGE = "https://pies.example/apple-pie"

const page = `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Apple Pie",
    totalTime: "PT60M",
    recipeIngredient: ["6 apples"],
    recipeInstructions: [{ "@type": "HowToStep", text: "Bake it." }],
  }
)}</script></head><body></body></html>`

let close: () => Promise<void>
let database: Database
let jobs: JobRunner
let kyle: TestClient
let openPage!: () => void
let pageGate: Promise<void>
let pageRequests = 0

beforeAll(async () => {
  pageGate = new Promise<void>((resolve) => {
    openPage = resolve
  })
  const aiFetcher = fakeAiFetcher()
  const fetcher: Fetcher = async (url, options) => {
    if (url !== PAGE) return aiFetcher(url, options)
    pageRequests++
    await pageGate
    return {
      url,
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: Buffer.from(page),
    }
  }
  const test = await createTestApp({
    fetcher,
    ai: mockAiModels({ input: 1000, output: 100 }, [], new Set(), () => ({
      toolCalls: [
        {
          toolName: "offer_recipes",
          input: {
            recipes: [{ url: PAGE, name: "Apple Pie", why: "A classic." }],
          },
        },
      ],
    })),
  })
  ;({ close, database, jobs } = test)
  kyle = await setUpServer(test.app, test.setupCode)
  const key = await kyle.post("/api/settings/server/ai/keys", {
    provider: "anthropic",
    key: GOOD_KEYS.anthropic,
  })
  expect(key.status).toBe(201)
})

afterAll(async () => {
  openPage()
  await jobs.stop()
  await close()
})

const stored = (id: string) =>
  database.em.fork().findOneOrFail(Discovery, { id }, { filters: false })

test("Find more after Stop isn't undone by the round that was stopped", async () => {
  const started = await kyle.post("/api/discover", { theme: "pies" })
  expect(started.status, await started.clone().text()).toBe(202)
  const { id } = await started.json()
  const firstJobId = (await stored(id)).jobId!

  // Its round is running, with its page still opening.
  await jobs.start()
  await expect.poll(() => pageRequests).toBe(1)

  // Stop waits for the round to end, so it hasn't answered yet, and the
  // search isn't over until it has.
  const stopping = kyle.post(`/api/discover/${id}/stop`)
  await new Promise((resolve) => setTimeout(resolve, 100))
  const early = await kyle.post(`/api/discover/${id}/more`)
  expect(early.status).toBe(409)
  expect((await early.json()).error.code).toBe("discover_busy")

  openPage()
  const stopped = await stopping
  expect(stopped.status, await stopped.clone().text()).toBe(200)
  expect(await stopped.json()).toMatchObject({ status: "stopped" })
  expect(
    (await database.em.fork().findOneOrFail(Job, { id: firstJobId })).status
  ).toBe("cancelled")

  // Find more now starts a new round, which isn't overwritten by the old.
  const more = await kyle.post(`/api/discover/${id}/more`)
  expect(more.status, await more.clone().text()).toBe(202)
  await jobs.drain()

  const search = await stored(id)
  expect(search.jobId).not.toBe(firstJobId)
  expect(search.status).toBe("done")
  expect(search.recipes.map((recipe) => recipe.name)).toEqual(["Apple Pie"])
})

test("Find more waits while the search's last job is still going", async () => {
  const em = database.em.fork()
  const search = await em.findOneOrFail(
    Discovery,
    { theme: "pies" },
    { filters: false }
  )
  // A stopped search whose job hasn't ended, as when Stop gave up waiting.
  const job = await em.findOneOrFail(Job, { id: search.jobId! })
  job.status = "running"
  search.status = "stopped"
  await em.flush()

  const more = await kyle.post(`/api/discover/${search.id}/more`)
  expect(more.status).toBe(409)
  expect((await more.json()).error.code).toBe("discover_busy")
})
