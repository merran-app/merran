import assert from "node:assert/strict"
import { test } from "node:test"

import {
  alongLine,
  edgeEnd,
  edgeStart,
  inEdgeZone,
  lockAxis,
  pastCommit,
  pullEnd,
  resist,
  swipeEnd,
  velocityOf,
} from "./swipe-math.ts"

const has = { start: true, end: true }
const flicks = { start: true, end: true }

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
  assert.deepEqual(
    swipeEnd({ offset: -40, width: 360, velocity: 0, has, flicks }),
    {
      kind: "close",
    }
  )
})

test("past the open line it stays open on that side", () => {
  assert.deepEqual(
    swipeEnd({ offset: -80, width: 360, velocity: 0, has, flicks }),
    {
      kind: "open",
      side: "end",
    }
  )
})

test("past half the row it commits", () => {
  assert.deepEqual(
    swipeEnd({ offset: 180, width: 360, velocity: 0, has, flicks }),
    {
      kind: "commit",
      side: "start",
    }
  )
})

test("a flick past the open line commits", () => {
  assert.deepEqual(
    swipeEnd({ offset: -90, width: 360, velocity: -0.8, has, flicks }),
    {
      kind: "commit",
      side: "end",
    }
  )
})

test("a flick back the other way doesn't commit", () => {
  assert.deepEqual(
    swipeEnd({ offset: -90, width: 360, velocity: 0.8, has, flicks }),
    {
      kind: "open",
      side: "end",
    }
  )
})

test("a side without an action always closes", () => {
  assert.deepEqual(
    swipeEnd({
      offset: 300,
      width: 360,
      velocity: 0,
      has: { start: false, end: true },
      flicks,
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

test("a flick never commits a destructive side", () => {
  assert.deepEqual(
    swipeEnd({
      offset: -90,
      width: 360,
      velocity: -0.8,
      has,
      flicks: { start: true, end: false },
    }),
    { kind: "open", side: "end" }
  )
})

test("a destructive side still commits past half the row", () => {
  assert.deepEqual(
    swipeEnd({
      offset: -180,
      width: 360,
      velocity: 0,
      has,
      flicks: { start: true, end: false },
    }),
    { kind: "commit", side: "end" }
  )
})

test("speed is measured over the last 100ms", () => {
  const samples = [
    { x: 0, t: 0 },
    { x: 10, t: 200 },
    { x: 60, t: 250 },
  ]
  assert.equal(velocityOf(samples, 250), 1)
})

test("a pause before lifting isn't a flick", () => {
  const samples = [
    { x: 0, t: 0 },
    { x: 100, t: 100 },
  ]
  assert.equal(velocityOf(samples, 300), 0)
})

test("one sample has no speed", () => {
  assert.equal(velocityOf([{ x: 5, t: 10 }], 10), 0)
})

test("edge back waits until a finger is clearly going right", () => {
  assert.equal(edgeStart(3, 4), "wait")
  assert.equal(edgeStart(14, 3), "back")
})

test("a scroll that starts at the edge stays a scroll", () => {
  assert.equal(edgeStart(0, 12), "scroll")
  assert.equal(edgeStart(-14, 3), "scroll")
})

test("along the line is from the left, or from the right in right-to-left", () => {
  assert.equal(alongLine(15, 375, "ltr"), 15)
  assert.equal(alongLine(365, 375, "rtl"), 10)
  assert.equal(inEdgeZone(alongLine(365, 375, "rtl")), true)
  assert.equal(inEdgeZone(alongLine(10, 375, "rtl")), false)
})

test("a swipe left in right-to-left goes along the line", () => {
  const from = alongLine(360, 375, "rtl")
  const to = alongLine(260, 375, "rtl")
  assert.equal(to - from, 100)
  assert.equal(edgeEnd(to - from, 0), "back")
  assert.equal(
    swipeEnd({ offset: to - from, width: 375, velocity: 0, has, flicks }).kind,
    "open"
  )
})
