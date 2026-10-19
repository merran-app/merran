import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { id } from "./base.ts"
import { OauthClient } from "./oauth_clients.ts"
import { OauthResource } from "./oauth_resources.ts"

/** OAuth Provider persistence, mapped to Merran's single migration history. */
export const OauthClientResource = defineEntity({
  name: "OauthClientResource",
  tableName: "oauth_client_resources",
  uniques: [{ properties: ["client", "resource"] }],
  properties: {
    id: id(),
    client: () =>
      p
        .manyToOne(OauthClient)
        .targetKey("clientId")
        .ref()
        .deleteRule("cascade")
        .index(),
    resource: () =>
      p
        .manyToOne(OauthResource)
        .targetKey("identifier")
        .ref()
        .deleteRule("cascade")
        .index(),
    metadata: p.json<Record<string, unknown>>().nullable(),
    createdAt: p.datetime().nullable(),
  },
})
export type OauthClientResource = InferEntity<typeof OauthClientResource>
