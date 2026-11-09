import assert from "node:assert/strict"
import { test } from "node:test"

import { isNewRecipe } from "./new-recipe.ts"

const now = Date.parse("2026-11-09T12:00:00Z")
const HOUR = 60 * 60 * 1000

test("a recipe added today is new", () => {
  assert.equal(isNewRecipe("2026-11-09T08:00:00Z", now), true)
})

test("one added six days and 23 hours ago still is", () => {
  const added = new Date(now - (6 * 24 + 23) * HOUR).toISOString()
  assert.equal(isNewRecipe(added, now), true)
})

test("one added seven days ago isn't", () => {
  const added = new Date(now - 7 * 24 * HOUR).toISOString()
  assert.equal(isNewRecipe(added, now), false)
})

test("a date that can't be read isn't", () => {
  assert.equal(isNewRecipe("nonsense", now), false)
})
