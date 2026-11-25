import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { Job } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { forHousehold } from "../../../database/scope.ts"
import { fakeAiFetcher, GOOD_KEYS, mockAiModels } from "../../../test/ai.ts"
import {
  createTestApp,
  setUpServer,
  type TestClient,
} from "../../../test/app.ts"
import type { MediaMakers } from "../../ai/media.ts"
import { ACTIVE } from "../../jobs/jobs.ts"
import type { JobRunner } from "../../jobs/runner.ts"
import { LocalFileStore } from "../../storage/files.ts"
import { loadRecipe } from "../recipes.ts"
import { makePhotoNow } from "./runs.ts"

// A recipe's photo as a job: done while the request waits, or handed over,
// with the recipe saying it's being made until it's in.

/** The image maker holds its pictures while a test has the gate closed. */
let release: (() => void) | null = null
let gate: Promise<void> = Promise.resolve()
const holdImages = () => {
  gate = new Promise<void>((resolve) => {
    release = resolve
  })
}
const releaseImages = () => release?.()

let made = 0
let picture: Buffer

const media: MediaMakers = {
  image: async () => {
    made++
    await gate
    return picture
  },
  speech: () => Promise.reject(new Error("Not in these tests.")),
}

let database: Database
let close: () => Promise<void>
let jobs: JobRunner
let home: string
let userId: string
let kyle: TestClient
let deps: Parameters<typeof makePhotoNow>[0]

const em = () => forHousehold(database.em, home)

async function addRecipe(name: string) {
  const res = await kyle.post("/api/recipes", {
    name,
    servings: 2,
    ingredients: ["2 lemons"],
    steps: ["Squeeze them."],
  })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()).id as string
}

beforeAll(async () => {
  picture = await sharp({
    create: { width: 1536, height: 1024, channels: 3, background: "#b85" },
  })
    .png()
    .toBuffer()
  const test = await createTestApp({
    fetcher: fakeAiFetcher(),
    ai: mockAiModels(),
    media,
  })
  ;({ database, close, jobs } = test)
  deps = {
    jobs,
    settings: test.settings,
    fetcher: fakeAiFetcher(),
    media,
    files: new LocalFileStore(test.filesDir),
  }
  kyle = await setUpServer(test.app, test.setupCode)
  home = (await (await kyle.get("/api/households/current")).json()).id
  userId = (await (await kyle.get("/api/auth/me")).json()).id
  const key = await kyle.post("/api/settings/server/ai/keys", {
    provider: "openai",
    key: GOOD_KEYS.openai,
  })
  expect(key.status, await key.clone().text()).toBe(201)
  const on = await kyle.patch("/api/settings/server", {
    "photos.enabled": true,
    // The photos these tests ask for are the only ones made.
    "photos.auto": false,
  })
  expect(on.status, await on.clone().text()).toBe(200)
})

afterAll(() => close())

const makeOne = (handoverMs: number, recipe: string) =>
  makePhotoNow(
    deps,
    em(),
    { householdId: home, userId, recipe },
    { handoverMs }
  )

describe("making a photo now", () => {
  test("one that takes longer hands over, and the recipe says it's being made", async () => {
    const id = await addRecipe("Slow Lemons")
    // The save queued its nutrition: let it finish, so only the photo is timed.
    await jobs.drain()
    holdImages()
    const result = await makeOne(50, id)
    expect("started" in result).toBe(true)

    const before = await loadRecipe(em(), id)
    expect(before.working).toEqual(["photo"])
    expect(before.photo).toBeNull()

    releaseImages()
    await jobs.drain()
    const after = await loadRecipe(em(), id)
    expect(after.working).toEqual([])
    expect(after.photoByAi).toBe(true)
    expect(after.photo).not.toBeNull()
  })

  test("pressing it twice makes one photo", async () => {
    const id = await addRecipe("Pressed Lemons")
    // The save queued its nutrition: let it finish, so only the photo is timed.
    await jobs.drain()
    const before = made
    holdImages()
    const first = await makeOne(50, id)
    const second = await makeOne(50, id)
    expect("started" in first && "started" in second).toBe(true)
    if (!("started" in first) || !("started" in second)) return
    expect(second.started.id).toBe(first.started.id)
    expect(
      await em().count(Job, {
        key: `recipes.makePhoto:${id}`,
        status: { $in: [...ACTIVE] },
      })
    ).toBe(1)

    releaseImages()
    await jobs.drain()
    expect(made - before).toBe(1)
  })

  test("a photo made within the wait answers with the recipe", async () => {
    const id = await addRecipe("Quick Lemons")
    // The save queued its nutrition: let it finish, so only the photo is timed.
    await jobs.drain()
    holdImages()
    releaseImages()
    const result = await makeOne(5000, id)
    expect(result).toMatchObject({
      done: { name: "Quick Lemons", working: [], photoByAi: true },
    })
  })

  test("a photo a save queues counts as being made until it's done", async () => {
    // Made by themselves for this one test, put back after.
    await kyle.patch("/api/settings/server", { "photos.auto": true })
    try {
      holdImages()
      const id = await addRecipe("Saved Lemons")
      // Its nutrition is queued by the save too, so it's not the only one.
      expect((await loadRecipe(em(), id)).working).toContain("photo")

      releaseImages()
      await jobs.drain()
      expect((await loadRecipe(em(), id)).working).toEqual([])
    } finally {
      await kyle.patch("/api/settings/server", { "photos.auto": false })
    }
  })
})
