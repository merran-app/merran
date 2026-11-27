import assert from "node:assert/strict"
import { test } from "node:test"

import { nextOffset, uniqueById } from "./pages.ts"

test("the next page starts after what's loaded, while there's more", () => {
  const pages = [
    { total: 5, recipes: [{ id: "a" }, { id: "b" }] },
    { total: 5, recipes: [{ id: "c" }, { id: "d" }] },
  ]
  assert.equal(
    nextOffset(pages, (page) => page.recipes.length),
    4
  )
})

test("there's no next page once everything's loaded", () => {
  const pages = [{ total: 2, recipes: [{ id: "a" }, { id: "b" }] }]
  assert.equal(
    nextOffset(pages, (page) => page.recipes.length),
    undefined
  )
})

test("an empty page ends it, whatever the total says", () => {
  // The list shrank between pages.
  const pages = [
    { total: 5, recipes: [{ id: "a" }, { id: "b" }] },
    { total: 5, recipes: [] },
  ]
  assert.equal(
    nextOffset(pages, (page) => page.recipes.length),
    undefined
  )
})

test("a card pushed onto the next page shows once", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "b" }, { id: "c" }]
  assert.deepEqual(
    uniqueById(items).map((item) => item.id),
    ["a", "b", "c"]
  )
})
