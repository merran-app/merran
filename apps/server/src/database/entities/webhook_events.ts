import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"

/**
 * Something that happened in a household, kept once however many webhooks
 * are sent it, so each delivery sends the same payload.
 */
export const WebhookEvent = defineEntity({
  name: "WebhookEvent",
  tableName: "webhook_events",
  properties: {
    id: id(),
    household: () => householdRef(),
    /** "recipe.created" */
    type: p.string(),
    payload: p.json<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  indexes: [{ properties: ["household", "createdAt"] }],
  filters: householdFilter,
})
export type WebhookEvent = InferEntity<typeof WebhookEvent>
