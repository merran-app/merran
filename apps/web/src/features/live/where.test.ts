import assert from "node:assert/strict"
import { test } from "node:test"

import { liveWanted, pageOf } from "./where.ts"

test("the list and the plan are pages with people on them", () => {
  assert.equal(pageOf("/list"), "list")
  assert.equal(pageOf("/list/kroger"), "list")
  assert.equal(pageOf("/plan"), "plan")
  assert.equal(pageOf("/plan/2026-11-28"), "plan")
  assert.equal(pageOf("/recipes"), null)
  assert.equal(pageOf("/listing"), null)
})

test("the stream is wanted in the app and the cook view, not on sign-in or a shared recipe", () => {
  assert.equal(liveWanted(["__root__", "/_app", "/_app/"]), true)
  assert.equal(liveWanted(["__root__", "/_app", "/_app/plan"]), true)
  assert.equal(liveWanted(["__root__", "/_focus", "/_focus/cook"]), true)
  assert.equal(liveWanted(["__root__", "/login"]), false)
  assert.equal(liveWanted(["__root__", "/r/$token/"]), false)
  assert.equal(liveWanted(["__root__", "/r/$token/cook"]), false)
})
