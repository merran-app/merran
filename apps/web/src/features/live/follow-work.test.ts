import assert from "node:assert/strict"
import { test } from "node:test"

import { followWork } from "./follow-work.ts"

test("keeps asking while work goes, and stops when it's done", () => {
  assert.equal(typeof followWork(true), "number")
  assert.equal(followWork(false), false)
})
