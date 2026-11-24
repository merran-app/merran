import assert from "node:assert/strict"
import { test } from "node:test"

import { isWatchedRead, watchReceipt } from "./watching.ts"

const read = (receiptId: string) => ({
  kind: "pantry.readReceipt",
  result: { receiptId, status: "ready" },
})

test("a receipt being watched gets no notice, until they stop", () => {
  assert.equal(isWatchedRead(read("r1")), false)

  const stop = watchReceipt("r1")
  assert.equal(isWatchedRead(read("r1")), true)
  assert.equal(isWatchedRead(read("r2")), false)

  stop()
  stop()
  assert.equal(isWatchedRead(read("r1")), false)
})

test("only receipt reads are skipped, and ones without a result aren't", () => {
  const stop = watchReceipt("r1")
  assert.equal(
    isWatchedRead({ kind: "stores.prices", result: { receiptId: "r1" } }),
    false
  )
  assert.equal(
    isWatchedRead({ kind: "pantry.readReceipt", result: null }),
    false
  )
  stop()
})
