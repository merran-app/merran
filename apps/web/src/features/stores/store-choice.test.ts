import assert from "node:assert/strict"
import { test } from "node:test"
import { storeForItem, type StoreChoices } from "./store-choice.ts"

const keys = ["kroger", "walmart"]
const item = {
  itemId: "milk",
  picked: ["kroger", "walmart"],
  sent: [] as string[],
}
const choices: StoreChoices = { rest: null, order: null, where: {} }

test("the chosen ordering store beats the most recent product pick", () => {
  assert.equal(
    storeForItem(item, keys, { ...choices, order: "walmart" }, "kroger"),
    "walmart"
  )
})

test("an item choice beats the ordering store", () => {
  assert.equal(
    storeForItem(
      item,
      keys,
      { ...choices, order: "walmart", where: { milk: "kroger" } },
      "walmart"
    ),
    "kroger"
  )
})

test("a completed send remains at its store", () => {
  assert.equal(
    storeForItem(
      { ...item, sent: ["kroger"] },
      keys,
      { ...choices, order: "walmart" },
      "walmart"
    ),
    "kroger"
  )
})

test("a mixed order uses the food's product store, then the rest store", () => {
  assert.equal(storeForItem(item, keys, choices, "walmart"), "kroger")
  assert.equal(
    storeForItem({ ...item, picked: [] }, keys, choices, "walmart"),
    "walmart"
  )
})
