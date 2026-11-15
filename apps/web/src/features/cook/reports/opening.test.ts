import assert from "node:assert/strict"
import test from "node:test"

import { afterCheckIn, openingStep } from "./opening.ts"

test("a remembered session is checked in on, even on Get ready", () => {
  // A reload after going back to Get ready, or after changing servings,
  // opens on Get ready: the session it was in carries on.
  assert.equal(openingStep("s-1", false), "check-in")
  assert.equal(openingStep("s-1", true), "check-in")
})

test("with nothing remembered, cooking starts only past Get ready", () => {
  assert.equal(openingStep(null, false), "wait")
  assert.equal(openingStep(null, true), "start")
})

test("a session still open carries on, as does one that couldn't be asked", () => {
  assert.equal(afterCheckIn("open", false), "keep")
  assert.equal(afterCheckIn("failed", true), "keep")
})

test("a session that's ended starts again only past Get ready", () => {
  assert.equal(afterCheckIn("gone", false), "wait")
  assert.equal(afterCheckIn("gone", true), "start")
})
