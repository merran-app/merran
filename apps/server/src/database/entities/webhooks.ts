import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"
import { Secret } from "./secrets.ts"
import { User } from "./users.ts"

/** Whether a webhook is being sent to. */
export const WEBHOOK_STATES = ["active", "paused"] as const

/**
 * Why a webhook is paused: its address kept failing, its address is gone
 * (410), or someone paused it.
 */
export const PAUSE_REASONS = ["gave_up", "gone", "by_hand"] as const
export type PauseReason = (typeof PAUSE_REASONS)[number]

/**
 * An address a household has asked Merran to tell when things happen. Only
 * the host is kept in the clear, to show in lists; the address, the signing
 * secret, the one it replaced and the extra headers are each sealed in a
 * secret.
 */
export const Webhook = defineEntity({
  name: "Webhook",
  tableName: "webhooks",
  properties: {
    id: id(),
    household: () => householdRef(),
    name: p.string(),
    /** The address's host, for lists: the rest of the address is sealed. */
    host: p.string(),
    address: () => p.manyToOne(Secret).ref().nullable().deleteRule("set null"),
    secret: () => p.manyToOne(Secret).ref().nullable().deleteRule("set null"),
    /** The signing secret before the last rotation, still signed with. */
    previousSecret: () =>
      p.manyToOne(Secret).ref().nullable().deleteRule("set null"),
    previousSecretUntil: p.datetime().nullable(),
    /** The extra headers as sealed JSON; their names are kept below to show. */
    headers: () => p.manyToOne(Secret).ref().nullable().deleteRule("set null"),
    headerNames: p.json<string[]>(),
    /** The event types it's sent, unless it's sent everything. */
    events: p.json<string[]>(),
    everything: p.boolean().default(false),
    state: p.enum(WEBHOOK_STATES).default("active"),
    pausedReason: p.enum(PAUSE_REASONS).nullable(),
    pausedAt: p.datetime().nullable(),
    /** When its deliveries began failing in a row; cleared by a success. */
    failingSince: p.datetime().nullable(),
    lastDeliveredAt: p.datetime().nullable(),
    lastError: p.text().nullable(),
    createdBy: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  filters: householdFilter,
})
export type Webhook = InferEntity<typeof Webhook>
