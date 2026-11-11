import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"
import { WebhookEvent } from "./webhook_events.ts"
import { Webhook } from "./webhooks.ts"

/** Where a delivery stands: waiting to be sent, sent, out of tries, or stopped. */
export const DELIVERY_STATES = [
  "waiting",
  "delivered",
  "failed",
  "stopped",
] as const

/** One event's trip to one webhook, and what came of each try. */
export const WebhookDelivery = defineEntity({
  name: "WebhookDelivery",
  tableName: "webhook_deliveries",
  properties: {
    id: id(),
    household: () => householdRef(),
    webhook: () => p.manyToOne(Webhook).ref().deleteRule("cascade").index(),
    // Indexed because the clean-up deletes old events, and Postgres doesn't
    // index a foreign key on its own.
    event: () => p.manyToOne(WebhookEvent).ref().deleteRule("cascade").index(),
    state: p.enum(DELIVERY_STATES).default("waiting"),
    tries: p.smallint().default(0),
    /** What the last try got back. */
    statusCode: p.smallint().nullable(),
    answer: p.text().nullable(),
    durationMs: p.integer().nullable(),
    error: p.text().nullable(),
    lastTriedAt: p.datetime().nullable(),
    deliveredAt: p.datetime().nullable(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  indexes: [{ properties: ["webhook", "createdAt"] }],
  filters: householdFilter,
})
export type WebhookDelivery = InferEntity<typeof WebhookDelivery>
