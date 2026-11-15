import assert from "node:assert/strict"
import { test } from "node:test"

import { importActions } from "./import-actions.ts"

const done = { status: "done", added: 12, failed: 0, stopped: 0 }

test("while it runs: Stop, and Undo once something came in", () => {
  const running = importActions({ ...done, status: "running" })
  assert.equal(running.stop, true)
  // Undo stops it first.
  assert.equal(running.undo, true)
  assert.equal(running.tryAgain, false)
  assert.equal(running.deleteRecord, false)
  assert.equal(
    importActions({ ...done, status: "queued", added: 0 }).undo,
    false
  )
})

test("once it's over: Undo, Delete the record, and Try again for what didn't come in", () => {
  assert.deepEqual(importActions(done), {
    stop: false,
    tryAgain: false,
    undo: true,
    restore: false,
    deleteRecord: true,
  })
  assert.equal(importActions({ ...done, failed: 2 }).tryAgain, true)
  assert.equal(importActions({ ...done, stopped: 3 }).tryAgain, true)
  assert.equal(
    importActions({ ...done, status: "failed", added: 0 }).tryAgain,
    true
  )
})

test("once undone: only Restore and Delete the record", () => {
  assert.deepEqual(importActions({ ...done, status: "undone", failed: 1 }), {
    stop: false,
    tryAgain: false,
    undo: false,
    restore: true,
    deleteRecord: true,
  })
})
