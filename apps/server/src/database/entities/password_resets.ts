import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { createdAt, id } from "./base.ts"
import { User } from "./users.ts"
import { Secret } from "./secrets.ts"
import { Job } from "./jobs.ts"

/** Account recovery is personal, independent of household membership. */
export const PasswordReset = defineEntity({
  name: "PasswordReset",
  tableName: "password_resets",
  properties: {
    id: id(),
    tokenHash: p.string().length(64).unique(),
    /** Filled by the worker, so requesting recovery never looks up an account. */
    user: () =>
      p.manyToOne(User).ref().nullable().deleteRule("cascade").index(),
    credentialVersion: p.string().length(64).nullable(),
    /** Sealed recipient and token, covered by server-secret rotation. */
    delivery: () => p.manyToOne(Secret).ref().nullable().deleteRule("set null"),
    job: () => p.manyToOne(Job).ref().nullable().deleteRule("set null"),
    expiresAt: p.datetime().index(),
    sentAt: p.datetime().nullable(),
    usedAt: p.datetime().nullable(),
    createdAt: createdAt(),
  },
})
export type PasswordReset = InferEntity<typeof PasswordReset>
