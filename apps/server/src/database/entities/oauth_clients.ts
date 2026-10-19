import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { id } from "./base.ts"
import { User } from "./users.ts"

/** OAuth Provider persistence, mapped to Merran's single migration history. */
export const OauthClient = defineEntity({
  name: "OauthClient",
  tableName: "oauth_clients",
  properties: {
    id: id(),
    clientId: p.text().unique(),
    clientSecret: p.text().nullable(),
    clientDiscoveryId: p.text().nullable(),
    disabled: p.boolean().nullable().default(false),
    skipConsent: p.boolean().nullable(),
    enableEndSession: p.boolean().nullable(),
    subjectType: p.text().nullable(),
    scopes: p.json<string[]>().nullable(),
    clientCredentialsScopes: p.json<string[]>().nullable().default([]),
    user: () =>
      p.manyToOne(User).ref().nullable().deleteRule("cascade").index(),
    createdAt: p.datetime().nullable(),
    updatedAt: p.datetime().nullable(),
    name: p.text().nullable(),
    uri: p.text().nullable(),
    icon: p.text().nullable(),
    contacts: p.json<string[]>().nullable(),
    tos: p.text().nullable(),
    policy: p.text().nullable(),
    softwareId: p.text().nullable(),
    softwareVersion: p.text().nullable(),
    softwareStatement: p.text().nullable(),
    redirectUris: p.json<string[]>(),
    postLogoutRedirectUris: p.json<string[]>().nullable(),
    backchannelLogoutUri: p.text().nullable(),
    backchannelLogoutSessionRequired: p.boolean().nullable(),
    tokenEndpointAuthMethod: p.text().nullable(),
    applicationType: p.text().nullable(),
    jwks: p.text().nullable(),
    jwksUri: p.text().nullable(),
    grantTypes: p.json<string[]>().nullable(),
    responseTypes: p.json<string[]>().nullable(),
    requirePKCE: p.boolean().nullable(),
    dpopBoundAccessTokens: p.boolean().nullable().default(false),
    referenceId: p.text().nullable(),
    metadata: p.json<Record<string, unknown>>().nullable(),
  },
})
export type OauthClient = InferEntity<typeof OauthClient>
