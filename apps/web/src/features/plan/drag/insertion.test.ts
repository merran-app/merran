import assert from "node:assert/strict"
import { test } from "node:test"

import { insertionBar, insertionIndex, reorderFor } from "./insertion.ts"

const stacked = [0, 46, 92].map((top) => ({
  left: 0,
  top,
  width: 200,
  height: 40,
}))
const grid = [
  { left: 0, top: 0, width: 200, height: 40 },
  { left: 210, top: 0, width: 200, height: 40 },
  { left: 0, top: 50, width: 200, height: 40 },
]

test("stacked: before, between and after the dishes", () => {
  assert.equal(insertionIndex(stacked, { x: 50, y: 10 }), 0)
  assert.equal(insertionIndex(stacked, { x: 50, y: 30 }), 1)
  assert.equal(insertionIndex(stacked, { x: 50, y: 70 }), 2)
  assert.equal(insertionIndex(stacked, { x: 50, y: 200 }), 3)
})

test("a grid goes in reading order", () => {
  assert.equal(insertionIndex(grid, { x: 50, y: 20 }), 0)
  assert.equal(insertionIndex(grid, { x: 150, y: 20 }), 1)
  assert.equal(insertionIndex(grid, { x: 260, y: 20 }), 1)
  assert.equal(insertionIndex(grid, { x: 350, y: 20 }), 2)
  assert.equal(insertionIndex(grid, { x: 150, y: 60 }), 3)
})

test("the bar lies across a stack and stands up in a row", () => {
  assert.deepEqual(insertionBar(stacked, 1), {
    left: 0,
    top: 41.5,
    width: 200,
    height: 3,
  })
  assert.deepEqual(insertionBar(grid, 1), {
    left: 203.5,
    top: 0,
    width: 3,
    height: 40,
  })
})

test("the bar sits just outside the first and last dishes", () => {
  assert.deepEqual(insertionBar(stacked, 0), {
    left: 0,
    top: -4.5,
    width: 200,
    height: 3,
  })
  assert.deepEqual(insertionBar(stacked, 3), {
    left: 0,
    top: 133.5,
    width: 200,
    height: 3,
  })
  assert.deepEqual(insertionBar(grid, 3), {
    left: 201.5,
    top: 50,
    width: 3,
    height: 40,
  })
})

test("the new order, or none when nothing would change", () => {
  assert.deepEqual(reorderFor(["a", "b", "c"], "a", 2), ["b", "c", "a"])
  assert.deepEqual(reorderFor(["a", "b", "c"], "c", 0), ["c", "a", "b"])
  assert.equal(reorderFor(["a", "b", "c"], "b", 1), null)
  assert.equal(reorderFor(["a"], "a", 0), null)
})
