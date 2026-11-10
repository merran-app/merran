import assert from "node:assert/strict"
import { test } from "node:test"

import { codeFromPath, loadLocale } from "./locale-files.ts"

test("a locale file's code is its name", () => {
  assert.equal(codeFromPath("./locales/pt-BR.json"), "pt-BR")
  assert.equal(codeFromPath("./locales/en.json"), "en")
  assert.equal(codeFromPath("./locales/readme.md"), null)
})

test("loads the file for a code", async () => {
  const loaders = {
    "./locales/pl.json": async () => ({ default: { hello: "Cześć" } }),
  }
  assert.deepEqual(await loadLocale("pl", loaders), { hello: "Cześć" })
})

test("none for a code without a file", async () => {
  assert.equal(await loadLocale("de", {}), null)
})

test("none, not a crash, when the file won't load", async () => {
  const broken = {
    "./locales/pl.json": async () => {
      throw new Error("offline")
    },
  }
  assert.equal(await loadLocale("pl", broken), null)
  const odd = { "./locales/pl.json": async () => ({ default: "oops" }) }
  assert.equal(await loadLocale("pl", odd), null)
})
