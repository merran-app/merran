import assert from "node:assert/strict"
import test from "node:test"

import { stillOpening } from "./opening.ts"

const NOW = Date.parse("2026-11-14T12:00:00Z")
const ago = (ms: number) => new Date(NOW - ms).toISOString()

test("a site read for the first time is still opening", () => {
  assert.equal(
    stillOpening({ reading: true, waiting: 0, readAt: null }, NOW),
    true
  )
})

test("posts waiting just after a read are still opening", () => {
  assert.equal(
    stillOpening({ reading: false, waiting: 2, readAt: ago(60_000) }, NOW),
    true
  )
})

test("posts still waiting long after a read aren't", () => {
  // A post the site refused stays waiting: it doesn't keep the page asking.
  assert.equal(
    stillOpening({ reading: false, waiting: 2, readAt: ago(4 * 60_000) }, NOW),
    false
  )
})

test("nothing waiting isn't", () => {
  assert.equal(
    stillOpening({ reading: false, waiting: 0, readAt: ago(10_000) }, NOW),
    false
  )
})
