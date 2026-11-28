import assert from "node:assert/strict"
import { test } from "node:test"

import { clockOf, todayPlanRange, weekShown } from "./clock.ts"

const NOW = new Date("2026-11-28T20:00:00Z")

const auckland = clockOf(
  { timeZone: "Pacific/Auckland", weekStartsOn: 1, meals: ["dinner"] },
  NOW
)

test("the clock is the household's", () => {
  assert.equal(auckland.today, "2026-11-29")
  assert.equal(auckland.hour, 9)
  assert.equal(auckland.thisWeek, "2026-11-23")
  assert.deepEqual(auckland.meals, ["dinner"])
})

test("without a household it's UTC, from Monday", () => {
  const clock = clockOf(undefined, NOW)
  assert.equal(clock.today, "2026-11-28")
  assert.equal(clock.weekStartsOn, 1)
  assert.equal(clock.thisWeek, "2026-11-23")
})

test("Today's plan runs from the week's first day to a week from today", () => {
  assert.deepEqual(todayPlanRange(auckland), {
    from: "2026-11-23",
    to: "2026-12-06",
  })
})

test("the plan shows the week of the day asked, or this week", () => {
  assert.deepEqual(weekShown("2026-12-03", auckland), {
    from: "2026-11-30",
    to: "2026-12-06",
  })
  assert.deepEqual(weekShown(undefined, auckland), {
    from: "2026-11-23",
    to: "2026-11-29",
  })
})
