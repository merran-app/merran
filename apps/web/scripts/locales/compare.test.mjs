import assert from "node:assert/strict"
import { test } from "node:test"

import { compareLocale, localeSetErrors, parseLocale } from "./compare.mjs"

const RECIPES = {
  recipes: {
    count_one: "{{count}} recipe",
    count_other: "{{count}} recipes",
  },
}

test("a locale file must be JSON", () => {
  assert.equal(parseLocale('{ "a": "A" }').ok, true)
  const broken = parseLocale('{ "a": }')
  assert.equal(broken.ok, false)
  assert.ok(broken.error.length > 0)
})

test("a plural group is one key, whatever forms English has", () => {
  const result = compareLocale({
    english: RECIPES,
    translation: {
      recipes: {
        count_one: "{{count}} przepis",
        count_few: "{{count}} przepisy",
        count_many: "{{count}} przepisów",
        count_other: "{{count}} przepisu",
      },
    },
    language: "pl",
  })
  assert.deepEqual(result, {
    percent: 100,
    missing: [],
    extra: [],
    placeholders: [],
    missingForms: [],
    extraForms: [],
  })
})

test("a missing key is a warning, and lowers the percentage", () => {
  const result = compareLocale({
    english: { a: "A", b: "B" },
    translation: { a: "Á" },
    language: "pl",
  })
  assert.deepEqual(result.missing, ["b"])
  assert.equal(result.percent, 50)
})

test("an empty value counts as missing", () => {
  const result = compareLocale({
    english: { a: "A", b: "B" },
    translation: { a: "Á", b: "" },
    language: "pl",
  })
  assert.deepEqual(result.missing, ["b"])
})

test("a key English doesn't have is an error", () => {
  const result = compareLocale({
    english: { a: "A", b: "B" },
    translation: { a: "Á", b: "B", c: "C" },
    language: "pl",
  })
  assert.deepEqual(result.extra, ["c"])
})

test("placeholders must match English's", () => {
  const result = compareLocale({
    english: { hi: "Hi {{name}}" },
    translation: { hi: "Salut {{nom}}" },
    language: "fr",
  })
  assert.deepEqual(result.placeholders, ["hi"])
})

test("a plural form may leave out {{count}}", () => {
  const result = compareLocale({
    english: RECIPES,
    translation: {
      recipes: { count_one: "Une recette", count_other: "{{count}} recettes" },
    },
    language: "fr",
  })
  assert.deepEqual(result.placeholders, [])
})

test("forms the language doesn't use are errors, and ones it needs are warnings", () => {
  const japanese = compareLocale({
    english: RECIPES,
    translation: { recipes: { count_one: "1", count_other: "{{count}}件" } },
    language: "ja",
  })
  assert.deepEqual(japanese.extraForms, ["recipes.count_one"])

  const polish = compareLocale({
    english: RECIPES,
    translation: {
      recipes: { count_one: "{{count}} przepis", count_other: "{{count}}" },
    },
    language: "pl",
  })
  assert.deepEqual(polish.missingForms, [
    "recipes.count_few",
    "recipes.count_many",
  ])

  const zero = compareLocale({
    english: RECIPES,
    translation: {
      recipes: {
        count_zero: "Brak przepisów",
        count_one: "{{count}} przepis",
        count_few: "{{count}} przepisy",
        count_many: "{{count}} przepisów",
        count_other: "{{count}} przepisu",
      },
    },
    language: "pl",
  })
  assert.deepEqual(zero.extraForms, [])
})

test("a locale must be in the list and the folder both", () => {
  const errors = localeSetErrors(["en", "pl"], ["en", "de"])
  assert.equal(errors.length, 2)
  assert.ok(errors.some((message) => message.includes("pl")))
  assert.ok(errors.some((message) => message.includes("de")))
  assert.deepEqual(localeSetErrors(["en"], ["en"]), [])
})
