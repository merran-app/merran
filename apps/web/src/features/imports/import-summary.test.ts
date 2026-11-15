import assert from "node:assert/strict"
import { test } from "node:test"

import { importSummary } from "./import-summary.ts"

const counts = {
  status: "done",
  total: 52,
  done: 52,
  added: 48,
  already: 3,
  failed: 1,
  stopped: 0,
  undone: 0,
}

test("while it goes, how far it's got", () => {
  assert.deepEqual(importSummary({ ...counts, status: "running", done: 12 }), [
    { key: "imports.summary.importing", values: { done: 12, total: 52 } },
  ])
  assert.deepEqual(importSummary({ ...counts, status: "queued" }), [
    { key: "imports.summary.waiting", values: {} },
  ])
})

test("once it's over, what came in, was there and didn't", () => {
  assert.deepEqual(importSummary(counts), [
    { key: "imports.summary.cameIn", values: { count: 48 } },
    { key: "imports.summary.already", values: { count: 3 } },
    { key: "imports.summary.didnt", values: { count: 1 } },
  ])
  assert.deepEqual(
    importSummary({ ...counts, added: 0, already: 0, failed: 0 }),
    [{ key: "imports.summary.nothingCameIn", values: {} }]
  )
})

test("stopped, failed or undone says so", () => {
  assert.deepEqual(
    importSummary({
      ...counts,
      status: "cancelled",
      already: 0,
      failed: 0,
      stopped: 4,
    }),
    [
      { key: "imports.summary.cameIn", values: { count: 48 } },
      { key: "imports.summary.stopped", values: { count: 4 } },
    ]
  )
  assert.deepEqual(
    importSummary({ ...counts, status: "failed", already: 0, failed: 0 }),
    [
      { key: "imports.summary.cameIn", values: { count: 48 } },
      { key: "imports.summary.failed", values: {} },
    ]
  )
  // How many Undo moved, not how many came in: two were kept.
  assert.deepEqual(importSummary({ ...counts, status: "undone", undone: 46 }), [
    { key: "imports.summary.undone", values: { count: 46 } },
  ])
})
