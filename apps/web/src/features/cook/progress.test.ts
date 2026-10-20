import assert from "node:assert/strict"
import test from "node:test"

import { loadProgress, saveProgress } from "./progress.ts"

const saved = new Map<string, string>()
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  },
})

test("held steps survive a cooking page reload", () => {
  saveProgress("salmon", {
    page: 3,
    ticked: ["rice"],
    held: ["air-fry-salmon"],
    scale: 0.5,
    with: null,
    savedAt: Date.now(),
  })

  assert.deepEqual(loadProgress("salmon", 0.5, null)?.held, ["air-fry-salmon"])
  assert.equal(loadProgress("salmon", 1, null), null)
})

test("cooking progress saved before holds existed still loads", () => {
  saved.set(
    "merran-cooking.older",
    JSON.stringify({
      page: 2,
      ticked: ["rice"],
      scale: 1,
      with: null,
      savedAt: Date.now(),
    })
  )

  assert.deepEqual(loadProgress("older", 1, null)?.held, [])
})
