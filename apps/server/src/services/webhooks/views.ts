import { isWebhookEventType } from "@merran/shared"
import type { Webhook, WebhookDelivery } from "../../database/entities/index.ts"
import { envelopeBody, messageId } from "./envelope.ts"

// What the Webhooks page shows. A webhook's address, secrets and header
// values are sealed and never shown here: only its host and header names.

/** How a webhook is doing: paused, active with deliveries failing, or working. */
function stateOf(webhook: Webhook) {
  if (webhook.state === "paused") return "paused" as const
  return webhook.failingSince ? ("failing" as const) : ("working" as const)
}

/** A webhook as the API shows it. */
export function describeWebhook(webhook: Webhook) {
  return {
    id: webhook.id,
    name: webhook.name,
    host: webhook.host,
    events: webhook.events.filter(isWebhookEventType),
    everything: webhook.everything,
    headers: webhook.headerNames,
    state: stateOf(webhook),
    pausedReason: webhook.pausedReason ?? null,
    pausedAt: webhook.pausedAt?.toISOString() ?? null,
    failingSince: webhook.failingSince?.toISOString() ?? null,
    lastError: webhook.lastError ?? null,
    lastDeliveredAt: webhook.lastDeliveredAt?.toISOString() ?? null,
    createdAt: webhook.createdAt.toISOString(),
  }
}
export type WebhookView = ReturnType<typeof describeWebhook>

/** A delivery, with its event loaded, as the deliveries log shows it. */
export function describeDelivery(delivery: WebhookDelivery) {
  const event = delivery.event.getEntity()
  return {
    id: delivery.id,
    event: {
      id: messageId(event),
      type: event.type,
      createdAt: event.createdAt.toISOString(),
    },
    state: delivery.state,
    tries: delivery.tries,
    statusCode: delivery.statusCode ?? null,
    answer: delivery.answer ?? null,
    durationMs: delivery.durationMs ?? null,
    error: delivery.error ?? null,
    lastTriedAt: delivery.lastTriedAt?.toISOString() ?? null,
    deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
    body: envelopeBody(event),
  }
}
export type DeliveryView = ReturnType<typeof describeDelivery>
