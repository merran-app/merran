import { expect, test } from "vitest"
import {
  COOKING_OUTCOMES,
  DEFAULT_SUMMARY_AT,
  HEADS_UP_EVENTS,
  isWebhookEventType,
  PICKABLE_WEBHOOK_EVENTS,
  WEBHOOK_AREAS,
  WEBHOOK_EVENTS,
} from "./events.ts"

test("every event is named once, and the test isn't pickable", () => {
  const types = WEBHOOK_EVENTS.map((event) => event.type)
  expect(new Set(types).size).toBe(types.length)
  expect(types).toEqual([
    "recipe.created",
    "recipe.updated",
    "recipe.deleted",
    "recipe.restored",
    "import.finished",
    "tidy.ready",
    "review.waiting",
    "cooking.started",
    "cooking.ended",
    "timer.started",
    "timer.extended",
    "timer.finished",
    "timer.cancelled",
    "plan.changed",
    "plan.autoplanned",
    "meal.cooked",
    "meal.skipped",
    "list.changed",
    "list.completed",
    "list.sent",
    "pantry.changed",
    "day.summary",
    "meal.time_to_start",
    "pantry.use_soon",
    "webhook.test",
  ])

  expect(PICKABLE_WEBHOOK_EVENTS).not.toContain("webhook.test")
  expect(PICKABLE_WEBHOOK_EVENTS).toContain("recipe.created")
  expect(PICKABLE_WEBHOOK_EVENTS).toContain("pantry.changed")
  expect(isWebhookEventType("webhook.test")).toBe(true)
  expect(isWebhookEventType("recipe.exploded")).toBe(false)
})

test("every area has an event, and the plan's come in order", () => {
  for (const area of WEBHOOK_AREAS) {
    const inArea = WEBHOOK_EVENTS.filter((event) => event.area === area)
    expect(inArea.length, area).toBeGreaterThan(0)
  }

  const plan = WEBHOOK_EVENTS.filter((event) => event.area === "plan")
  expect(plan.map((event) => event.type)).toEqual([
    "plan.changed",
    "plan.autoplanned",
    "meal.cooked",
    "meal.skipped",
  ])
})

test("cooking has its own area, before the plan", () => {
  expect(WEBHOOK_AREAS.indexOf("cooking")).toBe(1)

  const cooking = WEBHOOK_EVENTS.filter((event) => event.area === "cooking")
  expect(cooking.map((event) => event.type)).toEqual([
    "cooking.started",
    "cooking.ended",
    "timer.started",
    "timer.extended",
    "timer.finished",
    "timer.cancelled",
  ])
  for (const event of cooking) expect(event.pickable, event.type).toBe(true)

  const cooked = WEBHOOK_EVENTS.find((event) => event.type === "meal.cooked")
  expect(cooked?.area).toBe("plan")
  expect(COOKING_OUTCOMES).toEqual(["made", "stopped", "timed_out"])
})

test("the heads-ups have their own area, after the pantry", () => {
  expect(WEBHOOK_AREAS.indexOf("headsUps")).toBe(
    WEBHOOK_AREAS.indexOf("pantry") + 1
  )
  expect(HEADS_UP_EVENTS).toEqual([
    "day.summary",
    "meal.time_to_start",
    "pantry.use_soon",
  ])
  for (const type of HEADS_UP_EVENTS) {
    expect(PICKABLE_WEBHOOK_EVENTS, type).toContain(type)
  }
  expect(DEFAULT_SUMMARY_AT).toBe("07:00")
})
