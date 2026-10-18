import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"
import { User } from "./users.ts"

/**
 * Better Auth's invitations, which go to an email address and can only be
 * accepted by that address. Reserved for Better Auth compatibility; Merran's
 * own email invitations extend invite_links and use its existing join flow.
 */
export const EmailInvitation = defineEntity({
  name: "EmailInvitation",
  tableName: "email_invitations",
  properties: {
    id: id(),
    household: () => householdRef(),
    email: p.string().index(),
    role: p.string().nullable(),
    status: p.string().default("pending"),
    expiresAt: p.datetime(),
    createdAt: createdAt(),
    inviter: () => p.manyToOne(User).ref().deleteRule("cascade"),
  },
  filters: householdFilter,
})
export type EmailInvitation = InferEntity<typeof EmailInvitation>
