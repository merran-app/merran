import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { id } from "./base.ts"
import { User } from "./users.ts"

/** Public WebAuthn credentials. Private keys stay on the person's authenticator. */
export const Passkey = defineEntity({
  name: "Passkey",
  tableName: "passkeys",
  properties: {
    id: id(),
    name: p.string().nullable(),
    publicKey: p.text(),
    user: () => p.manyToOne(User).ref().deleteRule("cascade").index(),
    credentialID: p.text().unique(),
    counter: p.integer(),
    deviceType: p.string(),
    backedUp: p.boolean(),
    transports: p.text().nullable(),
    createdAt: p.datetime().nullable(),
    aaguid: p.string().nullable(),
  },
})
export type Passkey = InferEntity<typeof Passkey>
