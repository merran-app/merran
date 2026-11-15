import assert from "node:assert/strict"
import test from "node:test"

import type { Timer } from "../timers.tsx"
import { timerReport } from "./timer-report.ts"

const NOW = 1_800_000_000_000

function timer(changes: Partial<Timer> = {}): Timer {
  return {
    id: "t-1",
    label: "Simmer the sauce",
    endsAt: NOW + 600_000,
    done: false,
    cooking: { slug: "soup", scale: 1, session: "s-1" },
    ...changes,
  }
}

test("starting is set, with its seconds", () => {
  assert.deepEqual(timerReport(undefined, timer(), NOW), {
    kind: "set",
    label: "Simmer the sauce",
    seconds: 600,
  })
})

test("+1 minute is set, with the seconds now left", () => {
  const before = timer({ endsAt: NOW + 30_000 })
  const after = timer({ endsAt: NOW + 90_000 })

  assert.deepEqual(timerReport(before, after, NOW), {
    kind: "set",
    label: "Simmer the sauce",
    seconds: 90,
  })
})

test("+1 minute on one that's gone off is set again", () => {
  const before = timer({ endsAt: NOW - 5_000, done: true })
  const after = timer({ endsAt: NOW + 60_000 })

  assert.deepEqual(timerReport(before, after, NOW), {
    kind: "set",
    label: "Simmer the sauce",
    seconds: 60,
  })
})

test("a part second left counts as a whole one", () => {
  const after = timer({ endsAt: NOW + 400 })

  assert.equal(timerReport(undefined, after, NOW)?.kind, "set")
  assert.deepEqual(timerReport(undefined, after, NOW), {
    kind: "set",
    label: "Simmer the sauce",
    seconds: 1,
  })
})

test("cancelling a running timer is cancel", () => {
  assert.deepEqual(timerReport(timer(), undefined, NOW), { kind: "cancel" })
})

test("dismissing one that's gone off is nothing", () => {
  assert.equal(timerReport(timer({ done: true }), undefined, NOW), null)
})

test("going off is nothing: the server sends that itself", () => {
  const before = timer({ endsAt: NOW - 100 })
  const after = timer({ endsAt: NOW - 100, done: true })

  assert.equal(timerReport(before, after, NOW), null)
})

test("a timer with no session is nothing", () => {
  const guest = timer({ cooking: null })
  const before = timer({ cooking: { slug: "soup", scale: 1 } })

  assert.equal(timerReport(undefined, guest, NOW), null)
  assert.equal(timerReport(before, undefined, NOW), null)
})
