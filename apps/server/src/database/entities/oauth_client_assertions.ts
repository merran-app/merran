import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { id } from "./base.ts"

/** OAuth Provider persistence, mapped to Merran's single migration history. */
export const OauthClientAssertion = defineEntity({
  name: "OauthClientAssertion",
  tableName: "oauth_client_assertions",
  properties: {
    id: id(),
    expiresAt: p.datetime(),
  },
})
export type OauthClientAssertion = InferEntity<typeof OauthClientAssertion>
