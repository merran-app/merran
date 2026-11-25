import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { Discovery, Household, Job } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { forHousehold } from "../../../database/scope.ts"
import { removeOlderSearches } from "../../../services/recipes/discover/discover.ts"
import {
  foundPhotoPath,
  searchFolder,
} from "../../../services/recipes/discover/photos.ts"
import { LocalFileStore } from "../../../services/storage/files.ts"
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
  const test = await createTestApp()
  ;({ close, database } = test)
  files = new LocalFileStore(test.filesDir)
  kyle = await setUpServer(test.app, test.setupCode)

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
