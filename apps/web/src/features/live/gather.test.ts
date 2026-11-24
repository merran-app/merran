import assert from "node:assert/strict"
import { afterEach, beforeEach, mock, test } from "node:test"
import type { QueryKey } from "@tanstack/react-query"

import { gatherChanges } from "./gather.ts"
import { LIVE_REFRESH } from "./state.ts"

let refreshes: QueryKey[][]
let gather: ReturnType<typeof gatherChanges>

beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 })
  refreshes = []
  gather = gatherChanges((keys) => refreshes.push(keys))
})

afterEach(() => {
  gather.stop()
  mock.timers.reset()
})

test("a person's changes are gathered for a second", () => {
  gather.add("plan", false)
  mock.timers.tick(300)
  gather.add("plan", false)
  mock.timers.tick(699)
  assert.equal(refreshes.length, 0)
  mock.timers.tick(1)
  assert.deepEqual(refreshes, [[["plan"]]])
})

test("Merran's changes wait five seconds", () => {
  gather.add("recipes", true)
  mock.timers.tick(4_999)
  assert.equal(refreshes.length, 0)
  mock.timers.tick(1)
  assert.deepEqual(refreshes, [LIVE_REFRESH.recipes])
})

test("a person's change brings Merran's forward", () => {
  gather.add("recipes", true)
  mock.timers.tick(2_000)
  gather.add("list", false)
  mock.timers.tick(999)
  assert.equal(refreshes.length, 0)
  mock.timers.tick(1)
  assert.equal(refreshes.length, 1)
  assert.deepEqual(
    new Set(refreshes[0]),
    new Set([...LIVE_REFRESH.recipes!, ...LIVE_REFRESH.list!])
  )
  // Nothing more comes at five seconds.
  mock.timers.tick(5_000)
  assert.equal(refreshes.length, 1)
})

test("an area changed twice is refreshed once", () => {
  gather.add("list", false)
  gather.add("list", false)
  mock.timers.tick(1_000)
  assert.equal(refreshes.length, 1)
  assert.deepEqual(refreshes[0], LIVE_REFRESH.list)
})

test("stop() cancels what's waiting", () => {
  gather.add("plan", false)
  gather.stop()
  mock.timers.tick(10_000)
  assert.equal(refreshes.length, 0)
})

test("it gathers again after stopping", () => {
  gather.add("plan", false)
  gather.stop()
  gather.add("list", false)
  mock.timers.tick(1_000)
  assert.deepEqual(refreshes, [LIVE_REFRESH.list])
})
