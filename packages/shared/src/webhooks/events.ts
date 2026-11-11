// What a webhook can be told about. The server sends these and the web app
// lists them for people to pick from (docs/webhooks.md).

/** How the events are grouped when people pick them. */
export const WEBHOOK_AREAS = ["recipes", "webhooks"] as const
export type WebhookArea = (typeof WEBHOOK_AREAS)[number]

/** Every event, in the order people see them. */
export const WEBHOOK_EVENTS = [
  { type: "recipe.created", area: "recipes", pickable: true },
  { type: "recipe.updated", area: "recipes", pickable: true },
  { type: "recipe.deleted", area: "recipes", pickable: true },
  { type: "recipe.restored", area: "recipes", pickable: true },
  // Sent only by the Send test button, so it's never something to pick.
  { type: "webhook.test", area: "webhooks", pickable: false },
] as const

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number]["type"]

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
