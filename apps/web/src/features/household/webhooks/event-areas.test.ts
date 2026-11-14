import assert from "node:assert/strict"
import { test } from "node:test"

import {
  areasToOpen,
  areaSummary,
  PICKABLE,
  setArea,
  type PickableEvent,
} from "./event-areas.ts"

test("an area with nothing chosen counts none", () => {
  assert.deepEqual(areaSummary([], "recipes"), {
    chosen: 0,
    total: 7,
    state: "none",
  })
})

test("an area with some chosen counts some, and ignores other areas", () => {
  const value: PickableEvent[] = [
    "recipe.created",
    "recipe.deleted",
    "plan.changed",
  ]
  assert.deepEqual(areaSummary(value, "recipes"), {
    chosen: 2,
    total: 7,
    state: "some",
  })
})

test("an area with every event chosen counts all", () => {
  const value = PICKABLE.filter((event) => event.area === "list").map(
    (event) => event.type
  )
  assert.deepEqual(areaSummary(value, "list"), {
    chosen: 3,
    total: 3,
    state: "all",
  })
})

test("setting an area on adds all its events in catalog order, keeping the rest", () => {
  const result = setArea(["pantry.changed", "plan.changed"], "plan", true)
  assert.deepEqual(result, [
    "plan.changed",
    "plan.autoplanned",
    "meal.cooked",
    "meal.skipped",
    "pantry.changed",
  ])
})

test("setting an area on twice adds nothing twice", () => {
  const once = setArea(["recipe.updated"], "recipes", true)
  assert.deepEqual(setArea(once, "recipes", true), once)
  assert.equal(new Set(once).size, once.length)
})

test("setting an area off removes its events and leaves the others", () => {
  const result = setArea(
    ["recipe.created", "plan.changed", "meal.cooked"],
    "recipes",
    false
  )
  assert.deepEqual(result, ["plan.changed", "meal.cooked"])
})

test("the areas to open are those with something chosen, in order", () => {
  assert.deepEqual(areasToOpen([]), [])
  assert.deepEqual(areasToOpen(["pantry.changed", "recipe.created"]), [
    "recipes",
    "pantry",
  ])
})

test("the heads-ups are an area of their own, after the pantry", () => {
  assert.deepEqual(setArea([], "headsUps", true), [
    "day.summary",
    "meal.time_to_start",
    "pantry.use_soon",
  ])
  assert.deepEqual(areasToOpen(["pantry.use_soon", "pantry.changed"]), [
    "pantry",
    "headsUps",
  ])
})
