import { expect, test } from "vitest"
import {
  isWebhookEventType,
  PICKABLE_WEBHOOK_EVENTS,
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
    "webhook.test",
  ])

  expect(PICKABLE_WEBHOOK_EVENTS).not.toContain("webhook.test")
  expect(PICKABLE_WEBHOOK_EVENTS).toContain("recipe.created")
  expect(isWebhookEventType("webhook.test")).toBe(true)
  expect(isWebhookEventType("recipe.exploded")).toBe(false)
})
