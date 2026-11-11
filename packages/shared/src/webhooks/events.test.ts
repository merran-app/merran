import { expect, test } from "vitest"
import {
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
    "plan.changed",
    "plan.autoplanned",
    "meal.cooked",
    "meal.skipped",
    "list.changed",
    "list.completed",
    "list.sent",
    "pantry.changed",
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
