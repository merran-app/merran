import assert from "node:assert/strict"
import { test } from "node:test"

import { withWorking } from "./working.ts"

const recipe = {
  id: "r1",
  slug: "lemon-chicken",
  working: [] as ("nutrition" | "photo")[],
}

test("adds the work to that recipe, whichever key it was cached under", () => {
  assert.deepEqual(withWorking(recipe, "r1", "nutrition")?.working, [
    "nutrition",
  ])
  assert.deepEqual(
    withWorking({ ...recipe, working: ["photo"] }, "r1", "nutrition")?.working,
    ["photo", "nutrition"]
  )
})

test("leaves other recipes, and work already listed, as they were", () => {
  assert.equal(withWorking(recipe, "r2", "nutrition"), recipe)
  const going = { ...recipe, working: ["nutrition" as const] }
  assert.equal(withWorking(going, "r1", "nutrition"), going)
  assert.equal(withWorking(undefined, "r1", "photo"), undefined)
})
