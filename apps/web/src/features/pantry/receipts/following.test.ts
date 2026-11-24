import assert from "node:assert/strict"
import { test } from "node:test"

import { receiptsRefetchInterval } from "./following.ts"

test("the waiting list is followed only while a receipt is being read", () => {
  assert.equal(receiptsRefetchInterval(undefined), false)
  assert.equal(receiptsRefetchInterval({ receipts: [] }), false)
  assert.equal(
    receiptsRefetchInterval({ receipts: [{ status: "ready" }] }),
    false
  )
  assert.notEqual(
    receiptsRefetchInterval({
      receipts: [{ status: "ready" }, { status: "reading" }],
    }),
    false
  )
})
