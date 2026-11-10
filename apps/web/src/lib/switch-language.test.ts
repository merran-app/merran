import assert from "node:assert/strict"
import { test } from "node:test"

import { switchLanguage } from "./switch-language.ts"

/** A stand-in for i18next that counts its switches. */
function translator(language: string) {
  const fake = {
    language,
    switches: 0,
    async changeLanguage(code: string) {
      fake.switches += 1
      fake.language = code
    },
  }
  return fake
}

test("switches, and says so to the page", async () => {
  const i18n = translator("en")
  const page = { lang: "en", dir: "" }
  await switchLanguage(i18n, page, "ar-XB", "rtl")
  assert.equal(i18n.switches, 1)
  assert.deepEqual(page, { lang: "ar-XB", dir: "rtl" })
})

test("does nothing for the language already showing", async () => {
  // Every navigation applies the language: switching again would redraw
  // the whole app, and re-run effects that depend on t.
  const i18n = translator("en")
  const page = { lang: "en", dir: "ltr" }
  await switchLanguage(i18n, page, "en", "ltr")
  assert.equal(i18n.switches, 0)
})

test("still sets the page when only it is behind", async () => {
  const i18n = translator("en")
  const page = { lang: "en", dir: "" }
  await switchLanguage(i18n, page, "en", "ltr")
  assert.equal(page.dir, "ltr")
})
