import { createHash } from "node:crypto"
import { AsyncLocalStorage } from "node:async_hooks"
import { oauthProvider, type OAuthOptions } from "@better-auth/oauth-provider"
import { APIError } from "better-auth/api"
import type { AuthOptions } from "../auth.ts"
import { DATA_SCOPES } from "../permissions.ts"
import { roleIn } from "../../households/households.ts"

export const OAUTH_PREFIX = "mro_"
export const grantHousehold = new AsyncLocalStorage<string>()
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex")

export function oauthResources(publicUrl: string) {
  return {
    mcp: new URL("/mcp", publicUrl).href,
    api: new URL("/api", publicUrl).href,
  }
}

export function authorizationProvider({ config, database }: AuthOptions) {
  const enabled = config.fromEnv?.get("auth.oauth") === true
  if (enabled && !config.publicUrl)
    throw new Error("OAuth requires MERRAN_PUBLIC_URL.")
  if (enabled && config.publicUrl) {
    const url = new URL(config.publicUrl)
    if (
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      throw new Error(
        "OAuth requires an HTTPS public URL, or localhost for development."
      )
  }
  const resources = oauthResources(config.publicUrl ?? "http://localhost")
  const options = {
    loginPage: "/login",
    consentPage: "/authorize",
    disableJwtPlugin: true,
    scopes: [...DATA_SCOPES, "offline_access"],
    grantTypes: ["authorization_code", "refresh_token"] as (
      "authorization_code" | "refresh_token"
    )[],
    accessTokenExpiresIn: 600,
    refreshTokenExpiresIn: 30 * 24 * 60 * 60,
    refreshTokenReuseInterval: 0,
    codeExpiresIn: 300,
    prefix: { opaqueAccessToken: OAUTH_PREFIX, refreshToken: "mrr_" },
    storeTokens: { hash: tokenHash },
    storeClientSecret: "encrypted" as const,
    allowDynamicClientRegistration: enabled,
    allowUnauthenticatedClientRegistration: enabled,
    resources: enabled
      ? Object.values(resources).map((identifier) => ({
          identifier,
          name: identifier === resources.mcp ? "Merran MCP" : "Merran API",
          allowedScopes: [...DATA_SCOPES, "offline_access"],
        }))
      : [],
    enforcePerClientResources: true,
    clientPrivileges: async ({ user }) => user?.role === "admin",
    clientRegistrationDefaultResources: enabled ? [resources.mcp] : [],
    clientRegistrationAllowedResources: enabled ? Object.values(resources) : [],
    postLogin: {
      page: "/authorize/household",
      shouldRedirect: async () => !grantHousehold.getStore(),
      consentReferenceId: async ({
        user,
        session,
      }: {
        user: { id: string }
        session: Record<string, unknown>
      }) => {
        const household =
          grantHousehold.getStore() ?? session.activeOrganizationId
        if (
          typeof household !== "string" ||
          !(await roleIn(database.em.fork(), user.id, household))
        )
          throw new APIError("FORBIDDEN", {
            message: "Choose a household you belong to.",
          })
        return household
      },
    },
  } satisfies OAuthOptions<string[]>
  // Keep the provider's schema in the same tables and migrations as the app.
  const providerSchema = oauthProvider(options).schema
  const schema: Record<
    string,
    { modelName: string; fields: Record<string, string> }
  > = {}

  for (const [model, definition] of Object.entries(providerSchema)) {
    const fields: Record<string, string> = {}
    for (const field of Object.keys(definition.fields)) {
      fields[field] =
        field === "requirePKCE" ? "require_pkce" : snakeCase(field)
    }
    schema[model] = { modelName: snakeCase(model) + "s", fields }
  }

  return oauthProvider({ ...options, schema })
}

function snakeCase(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}
