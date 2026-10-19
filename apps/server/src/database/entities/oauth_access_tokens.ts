import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { id } from "./base.ts"
import { OauthClient } from "./oauth_clients.ts"
import { Session } from "./sessions.ts"
import { User } from "./users.ts"
import { OauthRefreshToken } from "./oauth_refresh_tokens.ts"

/** OAuth Provider persistence, mapped to Merran's single migration history. */
export const OauthAccessToken = defineEntity({
  name: "OauthAccessToken",
  tableName: "oauth_access_tokens",
  properties: {
    id: id(),
    token: p.text().unique(),
    client: () =>
      p
        .manyToOne(OauthClient)
        .targetKey("clientId")
        .ref()
        .deleteRule("cascade")
        .index(),
    session: () =>
      p.manyToOne(Session).ref().nullable().deleteRule("set null").index(),
    user: () =>
      p.manyToOne(User).ref().nullable().deleteRule("cascade").index(),
    referenceId: p.text().nullable(),
    authorizationCodeId: p.text().nullable().index(),
    resources: p.json<string[]>().nullable(),
    requestedUserInfoClaims: p.json<string[]>().nullable(),
    refresh: () =>
      p
        .manyToOne(OauthRefreshToken)
        .ref()
        .nullable()
        .deleteRule("cascade")
        .index(),
    expiresAt: p.datetime(),
    createdAt: p.datetime(),
    revoked: p.datetime().nullable(),
    confirmation: p.json<Record<string, unknown>>().nullable(),
    scopes: p.json<string[]>(),
  },
})
export type OauthAccessToken = InferEntity<typeof OauthAccessToken>
