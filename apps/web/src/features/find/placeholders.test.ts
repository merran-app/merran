import assert from "node:assert/strict"
import test from "node:test"

import { placeholders } from "./placeholders.ts"

test("fills a row of four while searching, and no more once it's done", () => {
  assert.equal(placeholders({ status: "searching", recipes: [] }), 4)
  assert.equal(placeholders({ status: "searching", recipes: [1, 2, 3] }), 1)
  assert.equal(
    placeholders({ status: "searching", recipes: [1, 2, 3, 4, 5] }),
    0
  )
  assert.equal(placeholders({ status: "done", recipes: [] }), 0)
})
