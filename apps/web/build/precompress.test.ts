import assert from "node:assert/strict"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, test } from "node:test"
import { brotliDecompressSync, gunzipSync } from "node:zlib"

import { precompress } from "./precompress.ts"

let dir: string

/** Text that's this many bytes long, and compresses well. */
function text(bytes: number) {
  return "const merran = 1\n".repeat(bytes).slice(0, bytes)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "merran-dist-"))
  mkdirSync(join(dir, "assets"))
  writeFileSync(join(dir, "assets", "app.js"), text(2_000))
  writeFileSync(join(dir, "small.js"), text(100))
  writeFileSync(join(dir, "photo.png"), text(2_000))
  writeFileSync(join(dir, "index.html"), text(2_000))
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

test("compresses big text files both ways", async () => {
  assert.equal(await precompress(dir), 2)

  for (const file of ["assets/app.js", "index.html"]) {
    const original = readFileSync(join(dir, file))
    const br = readFileSync(join(dir, `${file}.br`))
    const gz = readFileSync(join(dir, `${file}.gz`))
    assert.deepEqual(brotliDecompressSync(br), original, file)
    assert.deepEqual(gunzipSync(gz), original, file)
  }
})

test("leaves small files and images alone", async () => {
  await precompress(dir)

  assert.equal(existsSync(join(dir, "small.js.br")), false)
  assert.equal(existsSync(join(dir, "small.js.gz")), false)
  assert.equal(existsSync(join(dir, "photo.png.br")), false)
  assert.equal(existsSync(join(dir, "photo.png.gz")), false)
})

test("doesn't compress what it wrote", async () => {
  await precompress(dir)

  assert.equal(await precompress(dir), 2)
  assert.equal(existsSync(join(dir, "assets", "app.js.br.br")), false)
  assert.equal(existsSync(join(dir, "assets", "app.js.gz.gz")), false)
})
