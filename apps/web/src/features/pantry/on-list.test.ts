import assert from "node:assert/strict"
import { test } from "node:test"

import { splitOnList } from "./on-list.ts"

const row = (name: string, checked = false) => ({ name, checked })

test("something not on the list is added", () => {
  assert.deepEqual(splitOnList(["rice"], [row("milk")]), {
    adding: ["rice"],
    already: [],
  })
})

test("something on the list already isn't added again", () => {
  assert.deepEqual(splitOnList(["rice"], [row("rice")]), {
    adding: [],
    already: ["rice"],
  })
})

test("names match whatever their case and spacing", () => {
  assert.deepEqual(splitOnList(["Basmati  Rice"], [row(" basmati rice ")]), {
    adding: [],
    already: ["Basmati  Rice"],
  })
})

test("a checked-off row doesn't count: that one's bought", () => {
  assert.deepEqual(splitOnList(["rice"], [row("rice", true)]), {
    adding: ["rice"],
    already: [],
  })
})

test("several at once are split between the two", () => {
  assert.deepEqual(
    splitOnList(["rice", "beans", "milk"], [row("beans"), row("milk")]),
    { adding: ["rice"], already: ["beans", "milk"] }
  )
})
