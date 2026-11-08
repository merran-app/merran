import assert from "node:assert/strict"
import { test } from "node:test"

import {
  edgeEnd,
  inEdgeZone,
  lockAxis,
  pastCommit,
  pullEnd,
  resist,
  swipeEnd,
} from "./swipe-math.ts"

const has = { start: true, end: true }

test("a small movement isn't a direction yet", () => {
  assert.equal(lockAxis(6, 3), null)
})

test("a scroll that starts a little sideways stays a scroll", () => {
  assert.equal(lockAxis(9, 14), "y")
  assert.equal(lockAxis(12, 12), "y")
})

test("clearly sideways locks to x", () => {
  assert.equal(lockAxis(-14, 5), "x")
})

test("a short swipe closes", () => {
  assert.deepEqual(swipeEnd({ offset: -40, width: 360, velocity: 0, has }), {
    kind: "close",
  })
})

test("past the open line it stays open on that side", () => {
  assert.deepEqual(swipeEnd({ offset: -80, width: 360, velocity: 0, has }), {
    kind: "open",
    side: "end",
  })
})

test("past half the row it commits", () => {
  assert.deepEqual(swipeEnd({ offset: 180, width: 360, velocity: 0, has }), {
    kind: "commit",
    side: "start",
  })
})

test("a flick past the open line commits", () => {
  assert.deepEqual(swipeEnd({ offset: -90, width: 360, velocity: -0.8, has }), {
    kind: "commit",
    side: "end",
  })
})

test("a flick back the other way doesn't commit", () => {
  assert.deepEqual(swipeEnd({ offset: -90, width: 360, velocity: 0.8, has }), {
    kind: "open",
    side: "end",
  })
})

test("a side without an action always closes", () => {
  assert.deepEqual(
    swipeEnd({
      offset: 300,
      width: 360,
      velocity: 0,
      has: { start: false, end: true },
    }),
    { kind: "close" }
  )
})

test("the buzz comes at half the row", () => {
  assert.equal(pastCommit(-179, 360), false)
  assert.equal(pastCommit(-180, 360), true)
})

test("the pull resists and refreshes only past the line", () => {
  assert.ok(resist(100) < 100)
  assert.equal(resist(-5), 0)
  assert.equal(pullEnd(60), "cancel")
  assert.equal(pullEnd(120), "refresh")
})

test("the edge zone is the first 20px", () => {
  assert.equal(inEdgeZone(20), true)
  assert.equal(inEdgeZone(21), false)
})

test("going back needs 80px, mostly sideways", () => {
  assert.equal(edgeEnd(79, 0), "cancel")
  assert.equal(edgeEnd(90, 10), "back")
  assert.equal(edgeEnd(90, 120), "cancel")
})
