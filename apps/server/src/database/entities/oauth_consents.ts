import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { id } from "./base.ts"
import { OauthClient } from "./oauth_clients.ts"
import { User } from "./users.ts"

/** OAuth Provider persistence, mapped to Merran's single migration history. */
export const OauthConsent = defineEntity({
  name: "OauthConsent",
  tableName: "oauth_consents",
  properties: {
    id: id(),
    client: () =>
      p
        .manyToOne(OauthClient)
        .targetKey("clientId")
        .ref()
        .deleteRule("cascade")
        .index(),
    user: () =>
      p.manyToOne(User).ref().nullable().deleteRule("cascade").index(),
    referenceId: p.text().nullable(),
    resources: p.json<string[]>().nullable(),
    requestedUserInfoClaims: p.json<string[]>().nullable(),
    scopes: p.json<string[]>(),
    createdAt: p.datetime(),
    updatedAt: p.datetime(),
    lastUsedAt: p.datetime().nullable(),
  },
})
export type OauthConsent = InferEntity<typeof OauthConsent>
