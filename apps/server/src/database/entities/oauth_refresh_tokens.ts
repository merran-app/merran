import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { id } from "./base.ts"
import { OauthClient } from "./oauth_clients.ts"
import { Session } from "./sessions.ts"
import { User } from "./users.ts"

/** OAuth Provider persistence, mapped to Merran's single migration history. */
export const OauthRefreshToken = defineEntity({
  name: "OauthRefreshToken",
  tableName: "oauth_refresh_tokens",
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
    user: () => p.manyToOne(User).ref().deleteRule("cascade").index(),
    referenceId: p.text().nullable(),
    authorizationCodeId: p.text().nullable().index(),
    resources: p.json<string[]>().nullable(),
    requestedUserInfoClaims: p.json<string[]>().nullable(),
    expiresAt: p.datetime(),
    createdAt: p.datetime(),
    revoked: p.datetime().nullable(),
    rotatedAt: p.datetime().nullable(),
    rotationReplayResponse: p.text().nullable(),
    rotationReplayExpiresAt: p.datetime().nullable(),
    authTime: p.datetime().nullable(),
    confirmation: p.json<Record<string, unknown>>().nullable(),
    scopes: p.json<string[]>(),
  },
})
export type OauthRefreshToken = InferEntity<typeof OauthRefreshToken>
