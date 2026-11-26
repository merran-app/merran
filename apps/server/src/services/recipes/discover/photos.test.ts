import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { Fetcher } from "../../fetch/public-fetch.ts"
import { LocalFileStore } from "../../storage/files.ts"
import { foundPhotoPath, keepFoundPhoto, searchFolder } from "./photos.ts"

const HOME = "6f1c0a52-0000-4000-8000-000000000001"
const SEARCH = "6f1c0a52-0000-4000-8000-000000000002"
const PAGE = "https://cooking.example/soup"
const place = { householdId: HOME, discoveryId: SEARCH }

let folder: string
let files: LocalFileStore
let deps: { fetcher: Fetcher; files: LocalFileStore }

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), "merran-found-photos-"))
  files = new LocalFileStore(folder)
  const jpeg = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#a63" },
  })
    .jpeg()
    .toBuffer()
  const fetcher: Fetcher = async (url) => {
    if (!url.endsWith("/soup.jpg")) throw new Error("Not found")
    return { url, status: 200, contentType: "image/jpeg", body: jpeg }
  }
  deps = { fetcher, files }
})

afterAll(() => rmSync(folder, { recursive: true, force: true }))

describe("a found recipe's photo", () => {
  test("is kept small, as WebP", async () => {
    const kept = await keepFoundPhoto(
      deps,
      place,
      "https://cooking.example/soup.jpg",
      PAGE
    )
    expect(kept?.photoKey).toMatch(/^[0-9a-f]{24}$/)
    expect(kept?.photo).toBe(`/api/discover/${SEARCH}/photos/${kept?.photoKey}`)
    const file = await files.read(foundPhotoPath(HOME, SEARCH, kept!.photoKey))
    const meta = await sharp(file!).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 640, 480])
  })

  test("is null when there's no photo, or one that won't load", async () => {
    expect(await keepFoundPhoto(deps, place, null, PAGE)).toBeNull()
    expect(
      await keepFoundPhoto(
        deps,
        place,
        "https://cooking.example/missing.jpg",
        PAGE
      )
    ).toBeNull()
  })

  test("lives in its search's folder", () => {
    expect(searchFolder(HOME, SEARCH)).toBe(`discover/${HOME}/${SEARCH}`)
    expect(foundPhotoPath(HOME, SEARCH, "abc")).toBe(
      `${searchFolder(HOME, SEARCH)}/abc.webp`
    )
  })
})
