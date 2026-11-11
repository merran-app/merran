import assert from "node:assert/strict"
import { test } from "node:test"

import { allowHomeNetwork } from "./home-network.ts"

test("with the home network off, this household becomes the only one chosen", () => {
  assert.deepEqual(
    allowHomeNetwork({ mode: "off", households: [] }, "house-1"),
    {
      "webhooks.homeNetwork": "chosen",
      "webhooks.homeNetworkHouseholds": ["house-1"],
    }
  )
})

test("with some households chosen, this one joins them", () => {
  assert.deepEqual(
    allowHomeNetwork({ mode: "chosen", households: ["house-2"] }, "house-1"),
    { "webhooks.homeNetworkHouseholds": ["house-2", "house-1"] }
  )
})

test("nothing changes when every household is allowed", () => {
  assert.equal(
    allowHomeNetwork({ mode: "all", households: [] }, "house-1"),
    null
  )
})

test("nothing changes when this household is already chosen", () => {
  assert.equal(
    allowHomeNetwork({ mode: "chosen", households: ["house-1"] }, "house-1"),
    null
  )
})
