import { existsSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import type { FileStore } from "../../../../services/storage/files.ts"
import { createTestApp, setUpServer, TestClient } from "../../../../test/app.ts"

let app: App
let close: () => Promise<void>
let filesDir: string
let files: FileStore
let drain: () => Promise<void>
let kyle: TestClient
let householdId: string

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close, filesDir } = test)
  files = test.jobDeps.files
  drain = () => test.jobs.drain()
  kyle = await setUpServer(app, test.setupCode)
  householdId = (await (await kyle.get("/api/households/current")).json()).id
})

afterAll(() => close())

const photo = () =>
  sharp({
    create: { width: 40, height: 30, channels: 3, background: "#3a6" },
  })
    .png()
    .toBuffer()

/** A recipe with a photo, put in Recently deleted. Returns its id and photo folder. */
async function deletedRecipeWithPhoto(name: string) {
  const recipe = await (await kyle.post("/api/recipes", { name })).json()
  const res = await kyle.upload(
    `/api/recipes/${recipe.slug}/photo`,
    await photo(),
    "image/png"
  )
  const { photo: urls } = await res.json()
  const photoId = new URL(urls.card, "http://x").searchParams.get("v")
  await kyle.post("/api/recipes/bulk", { action: "delete", ids: [recipe.id] })
  return {
    id: recipe.id as string,
    folder: join(filesDir, "photos", householdId, photoId!),
  }
}

/**
 * Holds every file removal until `release` is called, so a test can look at
 * what a request left behind. Puts the file store back with `restore`.
 */
function holdRemovals() {
  const original = files.remove
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  files.remove = async (key) => {
    await gate
    await original.call(files, key)
  }
  return {
    release,
    restore: () => {
      files.remove = original
    },
  }
}

describe("deleting recipes for good", () => {
  test("Empty deletes the recipes at once and leaves their photos to a job", async () => {
    const soup = await deletedRecipeWithPhoto("Soup")
    const cake = await deletedRecipeWithPhoto("Cake")
    const hold = holdRemovals()
    try {
      const res = await kyle.delete("/api/recipes/deleted")

      // The request has answered with no file removed.
      expect(res.status).toBe(204)
      expect(await (await kyle.get("/api/recipes/deleted")).json()).toEqual([])
      expect(existsSync(soup.folder)).toBe(true)
      expect(existsSync(cake.folder)).toBe(true)

      hold.release()
      await drain()
      expect(existsSync(soup.folder)).toBe(false)
      expect(existsSync(cake.folder)).toBe(false)
    } finally {
      hold.release()
      hold.restore()
    }
  })

  test("Delete for good and picked ones leave their photos to the job too", async () => {
    const pie = await deletedRecipeWithPhoto("Pie")
    const bread = await deletedRecipeWithPhoto("Bread")
    const hold = holdRemovals()
    try {
      const one = await kyle.delete(`/api/recipes/deleted/${pie.id}`)
      const picked = await kyle.post("/api/recipes/deleted/bulk", {
        action: "purge",
        ids: [bread.id],
      })

      expect(one.status).toBe(204)
      expect(await picked.json()).toEqual({ changed: 1 })
      expect(existsSync(pie.folder)).toBe(true)
      expect(existsSync(bread.folder)).toBe(true)

      hold.release()
      await drain()
      expect(existsSync(pie.folder)).toBe(false)
      expect(existsSync(bread.folder)).toBe(false)
    } finally {
      hold.release()
      hold.restore()
    }
  })
})
