import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
  Discovery,
  Household,
  Job,
  SiteRecipe,
} from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { forHousehold } from "../../../database/scope.ts"
import { removeOlderSearches } from "../../../services/recipes/discover/discover.ts"
import {
  foundPhotoPath,
  searchFolder,
} from "../../../services/recipes/discover/photos.ts"
import { LocalFileStore } from "../../../services/storage/files.ts"
import { fakeAiFetcher, GOOD_KEYS, mockAiModels } from "../../../test/ai.ts"
import { createTestApp, setUpServer, TestClient } from "../../../test/app.ts"

const KEY = "a1b2c3d4e5f60718293a4b5c"
const URL = "https://cooking.example/lentil-soup"
const NAME = "Lentil Soup"
const WHY = "Thick, warming and cheap."

let close: () => Promise<void>
let database: Database
let kyle: TestClient
let home: string
let search: Discovery
let theirs: Discovery
let files: LocalFileStore

beforeAll(async () => {
  const test = await createTestApp({
    fetcher: fakeAiFetcher(),
    ai: mockAiModels(),
  })
  ;({ close, database } = test)
  files = new LocalFileStore(test.filesDir)
  kyle = await setUpServer(test.app, test.setupCode)
  // Kyle, the server admin, is in Home, so the server's key pays for Discover.
  const key = await kyle.post("/api/settings/server/ai/keys", {
    provider: "anthropic",
    key: GOOD_KEYS.anthropic,
  })
  expect(key.status).toBe(201)

  const em = database.em.fork()
  const household = await em.findOneOrFail(Household, { name: "Home" })
  home = household.id
  const other = em.create(Household, { name: "Next door", slug: "next-door" })
  search = em.create(Discovery, {
    household,
    theme: "soups",
    collection: null,
    status: "done",
    recipes: [],
  })
  theirs = em.create(Discovery, {
    household: other,
    theme: "stews",
    collection: null,
    status: "done",
    recipes: [],
  })
  await em.flush()
  // A recipe's photo path names its own search, so it's set once that has an id.
  search.recipes = [
    {
      url: URL,
      name: NAME,
      site: "cooking.example",
      minutes: 40,
      photo: `/api/discover/${search.id}/photos/${KEY}`,
      photoKey: KEY,
      shelfId: "kept inside",
      why: WHY,
    },
  ]
  theirs.recipes = [
    {
      url: "https://cooking.example/stew",
      name: "Stew",
      site: "cooking.example",
      minutes: null,
      photo: null,
      photoKey: KEY,
      why: "",
    },
  ]
  await em.flush()
  await files.put(
    foundPhotoPath(home, search.id, KEY),
    await sharp({
      create: { width: 64, height: 48, channels: 3, background: "#a63" },
    })
      .webp()
      .toBuffer()
  )
  await files.put(
    foundPhotoPath(other.id, theirs.id, KEY),
    Buffer.from("not yours")
  )
})

afterAll(() => close())

describe("a search's photos", () => {
  test("go to its household, and no one else", async () => {
    const mine = await kyle.get(`/api/discover/${search.id}/photos/${KEY}`)
    expect(mine.status).toBe(200)
    expect(mine.headers.get("content-type")).toBe("image/webp")
    expect(mine.headers.get("cache-control")).toBe("private, max-age=604800")

    const none = await kyle.get(
      `/api/discover/${search.id}/photos/${"0".repeat(24)}`
    )
    expect(none.status).toBe(404)
    expect((await none.json()).error.code).toBe("no_photo")

    const notMine = await kyle.get(`/api/discover/${theirs.id}/photos/${KEY}`)
    expect(notMine.status).toBe(404)
    expect((await notMine.json()).error.code).toBe("discovery_not_found")
  })

  test("are 404 when the file is gone", async () => {
    const em = database.em.fork()
    const household = await em.findOneOrFail(Household, { id: home })
    const bare = em.create(Discovery, {
      household,
      theme: "salads",
      collection: null,
      status: "done",
      recipes: [
        {
          url: "https://cooking.example/salad",
          name: "Salad",
          site: "cooking.example",
          minutes: null,
          photo: null,
          photoKey: KEY,
          why: "",
        },
      ],
    })
    await em.flush()
    const res = await kyle.get(`/api/discover/${bare.id}/photos/${KEY}`)
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe("no_photo")
  })
})

describe("describing a search", () => {
  test("leaves out what it keeps inside", async () => {
    const body = await (await kyle.get(`/api/discover/${search.id}`)).json()
    expect(body.recipes[0]).toEqual({
      url: URL,
      name: NAME,
      site: "cooking.example",
      minutes: 40,
      photo: `/api/discover/${search.id}/photos/${KEY}`,
      why: WHY,
    })
    expect(body.progress).toBeNull()
  })
})

describe("older searches", () => {
  test("go with their photos: a 13th queues the oldest's folder for removal", async () => {
    const em = database.em.fork()
    const busy = em.create(Household, { name: "Busy", slug: "busy" })
    const made: Discovery[] = []
    for (let i = 0; i < 13; i++) {
      made.push(
        em.create(Discovery, {
          household: busy,
          theme: `theme ${i}`,
          collection: null,
          status: "done",
          recipes: [],
          createdAt: new Date(Date.UTC(2026, 10, 1, 0, i)),
        })
      )
    }
    await em.flush()

    await removeOlderSearches(forHousehold(database.em, busy.id), busy.id)

    const kept = await forHousehold(database.em, busy.id).count(Discovery, {})
    expect(kept).toBe(12)
    const jobs = await database.em
      .fork()
      .find(Job, { kind: "files.remove", forHousehold: busy.id })
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.payload).toEqual({
      paths: [searchFolder(busy.id, made[0]!.id)],
    })
  })
})

/** The job that finds a search's recipes: the one its `jobId` names. */
async function jobFor(discoveryId: string) {
  const em = database.em.fork()
  const discovery = await em.findOneOrFail(
    Discovery,
    { id: discoveryId },
    { filters: false }
  )
  return em.findOneOrFail(Job, { id: discovery.jobId! }, { filters: false })
}

/** Ends a search by hand, as its job would. */
async function finish(discoveryId: string) {
  const em = database.em.fork()
  const found = await em.findOneOrFail(
    Discovery,
    { id: discoveryId },
    { filters: false }
  )
  found.status = "done"
  // Its job ends with it, or the search would wait on a job still going.
  if (found.jobId) {
    const job = await em.findOneOrFail(
      Job,
      { id: found.jobId },
      { filters: false }
    )
    job.status = "done"
    job.finishedAt = new Date()
  }
  await em.flush()
}

describe("finding more, and stopping", () => {
  let going: string

  beforeAll(async () => {
    const em = database.em.fork()
    // A shelf recipe that fits "soups", and one that's the search's already.
    for (const [name, slug] of [
      ["Tomato Soup", "tomato-soup"],
      ["Lentil Soup", "lentil-soup"],
    ] as const) {
      em.create(SiteRecipe, {
        url: `https://shelf.example/${slug}`,
        state: "recipe",
        siteName: "Shelf",
        name,
        courses: ["soup"],
        keywords: [],
        ingredients: ["1 cup water"],
        diets: [],
        publishedAt: new Date(),
      } as never)
    }
    await em.flush()
  })

  test("Find more adds a round to the same search", async () => {
    const more = await kyle.post(`/api/discover/${search.id}/more`)
    expect(more.status, await more.clone().text()).toBe(202)
    const body = await more.json()
    going = body.id
    expect(body.id).toBe(search.id)
    expect(body.status).toBe("searching")
    expect(body.progress).toBeNull()
    // The shelf's Lentil Soup is the search's own, so only Tomato Soup is new.
    expect(body.recipes.map((recipe: { name: string }) => recipe.name)).toEqual(
      [NAME, "Tomato Soup"]
    )
    const job = await jobFor(search.id)
    expect(job.status).toBe("queued")
    expect(job.payload).toMatchObject({
      discoveryId: search.id,
      avoid: ["Tomato Soup", NAME],
    })
  })

  test("Find more, and Start, wait for a search that's going", async () => {
    const more = await kyle.post(`/api/discover/${going}/more`)
    expect(more.status).toBe(409)
    expect((await more.json()).error.code).toBe("discover_busy")
    const start = await kyle.post("/api/discover", { theme: "stews" })
    expect(start.status).toBe(409)
  })

  test("Find more and Stop need a search of the household's", async () => {
    for (const path of ["more", "stop"]) {
      const none = await kyle.post(`/api/discover/${theirs.id}/${path}`)
      expect(none.status).toBe(404)
      const bad = await kyle.post(`/api/discover/nonsense/${path}`)
      expect(bad.status).toBe(404)
    }
  })

  test("Stop ends a search whose job is waiting, keeping what it found", async () => {
    const stopped = await kyle.post(`/api/discover/${going}/stop`)
    expect(stopped.status, await stopped.clone().text()).toBe(200)
    const body = await stopped.json()
    expect(body).toMatchObject({ status: "stopped", progress: null })
    expect(body.recipes).toHaveLength(2)
    expect((await jobFor(going)).status).toBe("cancelled")
    const again = await kyle.post(`/api/discover/${going}/stop`)
    expect(again.status).toBe(409)
    expect((await again.json()).error.code).toBe("discover_finished")
    // Stopped is over: Find more carries on from it.
    expect((await kyle.post(`/api/discover/${going}/more`)).status).toBe(202)
    await kyle.post(`/api/discover/${going}/stop`)
  })

  test("Stop ends a search from before its job was kept", async () => {
    const em = database.em.fork()
    const old = em.create(Discovery, {
      household: await em.findOneOrFail(Household, { id: home }),
      theme: "salads",
      collection: null,
      status: "searching",
      recipes: [],
    })
    await em.flush()
    const stopped = await kyle.post(`/api/discover/${old.id}/stop`)
    expect(stopped.status).toBe(200)
    expect(await stopped.json()).toMatchObject({ status: "stopped" })
  })

  test("a collection's Find more adds to its last search", async () => {
    const first = await kyle.post("/api/collections/soups/find")
    expect(first.status, await first.clone().text()).toBe(202)
    const started = await first.json()
    expect(started.collection).toBe("soups")
    await finish(started.id)

    const again = await kyle.post("/api/collections/soups/find")
    expect(again.status, await again.clone().text()).toBe(202)
    expect((await again.json()).id).toBe(started.id)
    const count = await database.em
      .fork()
      .count(Discovery, { collection: "soups" }, { filters: false })
    expect(count).toBe(1)
  })

  test("a collection's own recipes aren't brought back as the search grows", async () => {
    // The collection test before left its search going.
    const going = await database.em
      .fork()
      .find(Discovery, { status: "searching" }, { filters: false })
    for (const search of going) await finish(search.id)

    const em = database.em.fork()
    em.create(SiteRecipe, {
      url: "https://shelf.example/garlic-pasta-noodles",
      state: "recipe",
      siteName: "Shelf",
      name: "Garlic Pasta Noodles",
      courses: ["main"],
      keywords: [],
      ingredients: ["1 cup water"],
      diets: [],
      publishedAt: new Date(),
    } as never)
    await em.flush()
    const collection = await (await kyle.get("/api/collections/pasta")).json()
    const own = collection.recipes.map(
      (recipe: { name: string }) => recipe.name
    )
    expect(own).toContain("Garlic Pasta Noodles")

    // The collection's last search has 30 dishes already: more than the AI
    // is told about, which would push the collection's own names out.
    const last = em.create(Discovery, {
      household: await em.findOneOrFail(Household, { id: home }),
      theme: collection.theme,
      collection: "pasta",
      status: "done",
      recipes: Array.from({ length: 30 }, (_, i) => ({
        url: `https://filler.example/dish-${i}`,
        name: `Filler Dish ${i}`,
        site: "filler.example",
        minutes: null,
        photo: null,
        why: "",
      })),
    })
    await em.flush()

    const more = await kyle.post("/api/collections/pasta/find")
    expect(more.status, await more.clone().text()).toBe(202)
    const body = await more.json()
    expect(body.id).toBe(last.id)
    expect(body.recipes).toHaveLength(30)
    // The AI is told 30 of them, the newest first.
    const job = await jobFor(body.id)
    expect(job.payload.avoid).toHaveLength(30)
  })
})
