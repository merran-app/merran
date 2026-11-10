import assert from "node:assert/strict"
import { test } from "node:test"

import { aiStatusFor } from "./ai-for.ts"

const runs = {
  ok: true as const,
  ref: "anthropic:claude-sonnet-5-5",
  source: "server" as const,
}
const noKey = { ok: false as const, why: "noKey" as const }

test("a task goes by its own status", () => {
  const status = { tasks: { import: runs }, vision: noKey }
  assert.deepEqual(aiStatusFor(status, "import"), { ready: true, why: null })
})

test("photos and PDFs being imported go by the status for photos and PDFs", () => {
  const status = { tasks: { import: runs }, vision: noKey }
  assert.deepEqual(aiStatusFor(status, "import", { visual: true }), {
    ready: false,
    why: "noKey",
  })
})

test("nothing's known until the status is", () => {
  assert.deepEqual(aiStatusFor(undefined, "import", { visual: true }), {
    ready: undefined,
    why: null,
  })
})
