import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { LocalFileStore } from "./files.js"

describe("LocalFileStore", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "merran-files-"))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test("a put replaces the file whole and leaves nothing beside it", async () => {
    const files = new LocalFileStore(root)
    await files.put("photos/a/thumb.webp", Buffer.from("first"))
    await files.put("photos/a/thumb.webp", Buffer.from("second"))

    expect((await files.read("photos/a/thumb.webp"))?.toString()).toBe("second")
    expect(await readdir(join(root, "photos", "a"))).toEqual(["thumb.webp"])
  })
})
