import assert from "node:assert/strict"
import test from "node:test"

import { checklistCanChange, mayChangeChecklist } from "./progress.ts"

const none = { recipe: false, plan: false, list: false, cook: false }
const all = { recipe: true, plan: true, list: true, cook: true }

test("a dismissed checklist can't change", () => {
  assert.equal(checklistCanChange({ dismissed: true, progress: none }), false)
})

test("a finished one can't", () => {
  assert.equal(checklistCanChange({ dismissed: false, progress: all }), false)
})

test("one with a step left can", () => {
  assert.equal(
    checklistCanChange({
      dismissed: false,
      progress: { ...all, cook: false },
    }),
    true
  )
})

test("one not loaded can't", () => {
  assert.equal(checklistCanChange(undefined), false)
})

test("what loads on Today can change the checklist, as the other pages can", () => {
  for (const key of ["recipes", "plan", "list", "today"]) {
    assert.equal(mayChangeChecklist([key, "anything"]), true)
  }
  assert.equal(mayChangeChecklist(["pantry"]), false)
  assert.equal(mayChangeChecklist([]), false)
})
