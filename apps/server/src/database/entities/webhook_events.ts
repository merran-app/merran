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
    /** A small change waiting to be merged with others like it. */
    gathered: p.boolean().default(false),
    /** Merged into the event that was sent. */
    merged: p.boolean().default(false),
    /**
     * Unique in the household, for an event that must go once however
     * often it's looked for: a daily heads-up, "day.summary:2026-11-10".
     */
    key: p.string().nullable(),
    createdAt: createdAt(),
  },
  uniques: [{ properties: ["household", "key"] }],
  indexes: [
    { properties: ["household", "createdAt"] },
    { properties: ["household", "gathered", "merged"] },
  ],
  filters: householdFilter,
})
export type WebhookEvent = InferEntity<typeof WebhookEvent>
