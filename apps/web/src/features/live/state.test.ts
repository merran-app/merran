import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"

import {
  coveredByLive,
  followEvery,
  freshFor,
  heardFromLive,
  liveConnected,
  LIVE_REFRESH,
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

test("Today's summary is refreshed by the list, the pantry, recipes and the plan", () => {
  for (const area of ["list", "pantry", "recipes", "plan"]) {
    assert.ok(
      LIVE_REFRESH[area]!.some((key) => key.length === 1 && key[0] === "today"),
      `${area} refreshes ["today"]`
    )
  }
  assert.equal(coveredByLive(["today"]), true)
})

test("what changes without a word on the stream isn't covered", () => {
  // Recipe sites are read for the whole server, prices are checked and
  // webhooks delivered by jobs, and reading a receipt says nothing.
  assert.equal(coveredByLive(["recipes", "sites"]), false)
  assert.equal(coveredByLive(["recipes", "sites", "suggestions"]), false)
  assert.equal(coveredByLive(["recipes", "collections", "soups"]), false)
  assert.equal(coveredByLive(["list", "prices"]), false)
  assert.equal(coveredByLive(["household", "webhooks", "id-1"]), false)
  assert.equal(coveredByLive(["pantry", "receipts"]), false)
  // The rest of those areas still are.
  assert.equal(coveredByLive(["recipes", "detail", "soup"]), true)
  assert.equal(coveredByLive(["household", "members"]), true)
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

test("jobs are asked about rarely while the live stream says when they move", () => {
  heardFromLive(NOW)
  assert.equal(followEvery(1_000, NOW + 1_000), 30_000)
  // A minute with nothing: the stream may be gone, so ask at the old pace.
  assert.equal(followEvery(1_000, NOW + 60_000), 1_000)
  lostLive()
  assert.equal(followEvery(2_000, NOW), 2_000)
})
