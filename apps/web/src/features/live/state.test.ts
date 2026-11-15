import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"

import {
  coveredByLive,
  freshFor,
  heardFromLive,
  liveConnected,
  lostLive,
  refetchOnFocus,
} from "./state.ts"

const NOW = 1_800_000_000_000

beforeEach(() => lostLive())

test("a plan query is covered, a settings one isn't", () => {
  assert.equal(coveredByLive(["plan", "week", "2026-11-16"]), true)
  assert.equal(coveredByLive(["list"]), true)
  assert.equal(coveredByLive(["settings", "server"]), false)
  // A key that only starts the same way isn't one of them.
  assert.equal(coveredByLive(["planning"]), false)
})

test("a stream that's quiet for a minute isn't trusted", () => {
  assert.equal(liveConnected(NOW), false)
  heardFromLive(NOW)
  assert.equal(liveConnected(NOW + 59_999), true)
  assert.equal(liveConnected(NOW + 60_001), false)
})

test("covered queries stay fresh for five minutes while it's working", () => {
  heardFromLive(NOW)
  assert.equal(freshFor(["list"], NOW), 300_000)
  lostLive()
  assert.equal(freshFor(["list"], NOW), 30_000)
})

test("settings queries stay at thirty seconds", () => {
  assert.equal(freshFor(["settings", "server"], NOW), 30_000)
  heardFromLive(NOW)
  assert.equal(freshFor(["settings", "server"], NOW), 30_000)
})

test("covered queries skip the focus refetch only while it's working", () => {
  assert.equal(refetchOnFocus(["plan"], NOW), true)
  heardFromLive(NOW)
  assert.equal(refetchOnFocus(["plan"], NOW), false)
  assert.equal(refetchOnFocus(["settings", "server"], NOW), true)
  // A phone waking after a while: the stream looks open, but nothing came.
  assert.equal(refetchOnFocus(["plan"], NOW + 61_000), true)
})
