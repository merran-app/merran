import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { id } from "./base.ts"
import { User } from "./users.ts"

/** Better Auth encrypts the authenticator secret and recovery-code material. */
export const TwoFactor = defineEntity({
  name: "TwoFactor",
  tableName: "two_factors",
  properties: {
    id: id(),
    secret: p.text().index(),
    backupCodes: p.text(),
    user: () => p.manyToOne(User).ref().deleteRule("cascade").unique(),
    verified: p.boolean().default(true),
    failedVerificationCount: p.integer().default(0),
    lockedUntil: p.datetime().nullable(),
  },
})
export type TwoFactor = InferEntity<typeof TwoFactor>
