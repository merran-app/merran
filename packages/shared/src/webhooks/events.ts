// What a webhook can be told about. The server sends these and the web app
// lists them for people to pick from (docs/webhooks.md).

/** How the events are grouped when people pick them. */
export const WEBHOOK_AREAS = [
  "recipes",
  "cooking",
  "plan",
  "list",
  "pantry",
  "webhooks",
] as const
export type WebhookArea = (typeof WEBHOOK_AREAS)[number]

/** Every event, in the order people see them. */
export const WEBHOOK_EVENTS = [
  { type: "recipe.created", area: "recipes", pickable: true },
  { type: "recipe.updated", area: "recipes", pickable: true },
  { type: "recipe.deleted", area: "recipes", pickable: true },
  { type: "recipe.restored", area: "recipes", pickable: true },
  { type: "import.finished", area: "recipes", pickable: true },
  { type: "tidy.ready", area: "recipes", pickable: true },
  { type: "review.waiting", area: "recipes", pickable: true },
  { type: "cooking.started", area: "cooking", pickable: true },
  { type: "cooking.ended", area: "cooking", pickable: true },
  { type: "timer.started", area: "cooking", pickable: true },
  { type: "timer.extended", area: "cooking", pickable: true },
  { type: "timer.finished", area: "cooking", pickable: true },
  { type: "timer.cancelled", area: "cooking", pickable: true },
  { type: "plan.changed", area: "plan", pickable: true },
  { type: "plan.autoplanned", area: "plan", pickable: true },
  { type: "meal.cooked", area: "plan", pickable: true },
  { type: "meal.skipped", area: "plan", pickable: true },
  { type: "list.changed", area: "list", pickable: true },
  { type: "list.completed", area: "list", pickable: true },
  { type: "list.sent", area: "list", pickable: true },
  { type: "pantry.changed", area: "pantry", pickable: true },
  // Sent only by the Send test button, so it's never something to pick.
  { type: "webhook.test", area: "webhooks", pickable: false },
] as const

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number]["type"]

/**
 * How cooking ended: Made it, leaving cook view (once its timers were
 * done), or no word from cook view for a while.
 */
export const COOKING_OUTCOMES = ["made", "stopped", "timed_out"] as const
export type CookingOutcome = (typeof COOKING_OUTCOMES)[number]

/** The events a webhook can be set to listen for. */
export const PICKABLE_WEBHOOK_EVENTS = WEBHOOK_EVENTS.filter(
  (event) => event.pickable
).map((event) => event.type) as unknown as readonly [
  WebhookEventType,
  ...WebhookEventType[],
]

export function isWebhookEventType(value: string): value is WebhookEventType {
  return WEBHOOK_EVENTS.some((event) => event.type === value)
}
