import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"
import { User } from "./users.ts"
import { Job } from "./jobs.ts"
import { Secret } from "./secrets.ts"

export const INVITE_ROLES = ["admin", "member"] as const

/**
 * A single-use, week-long link. Email invitations also require the recipient's
 * address. Tokens are hashed; email delivery retains a sealed copy for resend.
 */
export const InviteLink = defineEntity({
  name: "InviteLink",
  tableName: "invite_links",
  properties: {
    id: id(),
    household: () => householdRef(),
    tokenHash: p.string().unique(),
    /** Null for copyable links; email invites are bound to this address. */
    email: p.string().nullable(),
    /** Kept sealed for delivery and resend, never returned by the API. */
    deliveryToken: () =>
      p.manyToOne(Secret).ref().nullable().deleteRule("set null"),
    deliveryJob: () => p.manyToOne(Job).ref().nullable().deleteRule("set null"),
    queuedAt: p.datetime().nullable(),
    sentAt: p.datetime().nullable(),
    role: p.enum(INVITE_ROLES).default("member"),
    createdBy: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    expiresAt: p.datetime(),
    usedAt: p.datetime().nullable(),
    usedBy: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    createdAt: createdAt(),
  },
  filters: householdFilter,
})
export type InviteLink = InferEntity<typeof InviteLink>
