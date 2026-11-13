import assert from "node:assert/strict"
import test from "node:test"

import {
  forgetSession,
  rememberedSession,
  rememberSession,
} from "./remembered.ts"

const saved = new Map<string, string>()
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  },
})

test("a session is remembered for each cooking", () => {
  rememberSession("soup", "s-1")
  rememberSession("soup:meal-1", "s-2")

  assert.equal(rememberedSession("soup"), "s-1")
  assert.equal(rememberedSession("soup:meal-1"), "s-2")
  assert.equal(rememberedSession("stew"), null)
})

test("it's forgotten after 12 hours, or when it's done", () => {
  saved.set(
    "merran-cooking-session.old",
    JSON.stringify({ id: "s-3", savedAt: Date.now() - 13 * 3_600_000 })
  )
  rememberSession("done", "s-4")
  forgetSession("done")

  assert.equal(rememberedSession("old"), null)
  assert.equal(rememberedSession("done"), null)
})

test("something unreadable is nothing remembered", () => {
  saved.set("merran-cooking-session.broken", "{not json")

  assert.equal(rememberedSession("broken"), null)
})
