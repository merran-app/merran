import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { id } from "./base.ts"

/** OAuth Provider persistence, mapped to Merran's single migration history. */
export const OauthResource = defineEntity({
  name: "OauthResource",
  tableName: "oauth_resources",
  properties: {
    id: id(),
    identifier: p.text().unique(),
    name: p.text(),
    accessTokenTtl: p.integer().nullable(),
    refreshTokenTtl: p.integer().nullable(),
    signingAlgorithm: p.text().nullable(),
    signingKeyId: p.text().nullable(),
    allowedScopes: p.json<string[]>().nullable(),
    customClaims: p.json<Record<string, unknown>>().nullable(),
    dpopBoundAccessTokensRequired: p.boolean().nullable().default(false),
    disabled: p.boolean().nullable().default(false),
    createdAt: p.datetime().nullable(),
    updatedAt: p.datetime().nullable(),
    policyVersion: p.integer().nullable().default(1),
    metadata: p.json<Record<string, unknown>>().nullable(),
  },
})
export type OauthResource = InferEntity<typeof OauthResource>
