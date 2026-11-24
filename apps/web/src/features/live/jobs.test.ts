import assert from "node:assert/strict"
import { test } from "node:test"

import { jobRefresh } from "./jobs.ts"

test("a job's own query, and what shows its kind", () => {
  assert.deepEqual(jobRefresh({ id: "j1", kind: "recipes.importLinks" }), [
    ["jobs", "j1"],
    ["imports"],
  ])
  assert.deepEqual(jobRefresh({ id: "j2", kind: "recipes.tidy" }), [
    ["jobs", "j2"],
    ["review", "runs"],
  ])
  assert.deepEqual(jobRefresh({ id: "j3", kind: "discover.search" }), [
    ["jobs", "j3"],
    ["recipes", "discover"],
  ])
})

test("a kind the app doesn't show only refreshes the job itself", () => {
  assert.deepEqual(jobRefresh({ id: "j4", kind: "something.new" }), [
    ["jobs", "j4"],
  ])
})

test("prices and receipts refresh what shows them", () => {
  assert.deepEqual(jobRefresh({ id: "j5", kind: "stores.prices" }), [
    ["jobs", "j5"],
    ["stores"],
  ])
  assert.deepEqual(jobRefresh({ id: "j6", kind: "pantry.readReceipt" }), [
    ["jobs", "j6"],
    ["pantry", "receipts"],
  ])
})

test("a save's nutrition and photo runs refresh the recipe page", () => {
  assert.deepEqual(jobRefresh({ id: "j7", kind: "recipes.nutrition" }), [
    ["jobs", "j7"],
    ["recipes", "nutrition"],
    ["recipes", "detail"],
  ])
  assert.deepEqual(jobRefresh({ id: "j8", kind: "recipes.photos" }), [
    ["jobs", "j8"],
    ["recipes", "photos"],
    ["recipes", "detail"],
  ])
})
