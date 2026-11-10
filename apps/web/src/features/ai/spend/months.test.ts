import assert from "node:assert/strict"
import { test } from "node:test"

import { lastSixMonths, previousMonth } from "./months.ts"

test("the month before January is December of the year before", () => {
  assert.equal(previousMonth("2026-01"), "2025-12")
  assert.equal(previousMonth("2026-11"), "2026-10")
})

test("six months end at this one, oldest first", () => {
  const months = lastSixMonths([], "2026-02").map((month) => month.month)
  assert.deepEqual(months, [
    "2025-09",
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
  ])
})

test("months with nothing spent are filled in, and spend lands on its month", () => {
  const spend = [
    { month: "2026-11", server: 16.7, own: 4.3, calls: 30 },
    { month: "2026-08", server: 11.5, own: 4.1, calls: 30 },
  ]
  const months = lastSixMonths(spend, "2026-11")
  assert.equal(months.length, 6)
  assert.deepEqual(months.at(-1), spend[0])
  assert.deepEqual(months[2], spend[1])
  assert.deepEqual(months[3], {
    month: "2026-09",
    server: 0,
    own: 0,
    calls: 0,
  })
})

test("older months than the last six are left out", () => {
  const spend = [{ month: "2026-01", server: 9, own: 0, calls: 3 }]
  const months = lastSixMonths(spend, "2026-11")
  assert.ok(months.every((month) => month.calls === 0))
})
