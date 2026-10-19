import type { AppDeps } from "../../core/context.ts"
import type { Router } from "../router.ts"
import { oauthResources } from "../../services/auth/oauth/provider.ts"
import { DATA_SCOPES } from "../../services/auth/permissions.ts"
import { AUTH_BASE } from "../../services/auth/auth.ts"
import { IDS } from "../schemas/examples.ts"

/** Protocol requests authenticate clients, rather than treating Basic credentials as API tokens. */
export function mountOAuthProtocol(app: Router, deps: AppDeps) {
  const enabled =
    deps.config.fromEnv.get("auth.oauth") === true && !!deps.config.publicUrl
  if (!enabled) return
  const origin = deps.config.publicUrl!
  const resources = oauthResources(origin)
  for (const [audience, resource] of Object.entries(resources)) {
    const path = `/.well-known/oauth-protected-resource/${audience}`
    app.get(path, (c) =>
      c.json({
        resource,
        authorization_servers: [new URL(AUTH_BASE, origin).href],
        scopes_supported: [...DATA_SCOPES, "offline_access"],
        bearer_methods_supported: ["header"],
      })
    )
  }
  for (const path of [
    "/.well-known/oauth-authorization-server/api/auth",
    `${AUTH_BASE}/.well-known/oauth-authorization-server`,
  ]) {
    app.get(path, async (c) =>
      c.json(await deps.auth.api.getOAuthServerConfig())
    )
  }
  for (const name of ["token", "revoke", "introspect", "register"]) {
    app.post(`${AUTH_BASE}/oauth2/${name}`, async (c) => {
      c.header("Cache-Control", "no-store")
      return deps.auth.handler(c.req.raw)
    })
  }
}

export const OAUTH_SESSION_ENDPOINTS = [
  {
    method: "POST",
    path: "/oauth2/create-client",
    signedIn: true,
    operationId: "createOAuthClient",
    requestExample: {
      client_name: "Kitchen app",
      redirect_uris: ["https://client.example.com/callback"],
      token_endpoint_auth_method: "client_secret_basic",
    },
    summary: "Register an application",
    description:
      "Server administrators can register an OAuth client for MCP or REST integrations.",
    responseExample: {},
  },
  {
    method: "GET",
    path: "/oauth2/authorize",
    signedIn: false,
    operationId: "authorizeApp",
    summary: "Authorize an application",
    description:
      "Starts an authorization-code flow with PKCE, household selection and consent.",
    responseExample: {},
  },
  {
    method: "POST",
    path: "/oauth2/continue",
    signedIn: true,
    operationId: "continueAuthorization",
    requestExample: {
      postLogin: true,
      householdId: IDS.household,
      oauth_query: "signed-authorization-query",
    },
    summary: "Continue authorization",
    description:
      "Confirms household selection using the signed authorization request.",
    responseExample: {
      redirect: true,
      url: "https://meals.example.com/authorize?sig=example",
    },
  },
  {
    method: "POST",
    path: "/oauth2/consent",
    signedIn: true,
    operationId: "consentToApp",
    requestExample: {
      accept: true,
      householdId: IDS.household,
      oauth_query: "signed-authorization-query",
    },
    summary: "Approve or deny application access",
    description:
      "Approves only the scopes in the signed request for the selected household.",
    responseExample: {
      redirect: true,
      url: "https://client.example.com/callback?code=example&state=example",
    },
  },
  {
    method: "GET",
    path: "/oauth2/public-client",
    signedIn: true,
    operationId: "publicAppDetails",
    summary: "Application details",
    description: "Public details to display before consenting.",
    responseExample: {},
  },
  {
    method: "GET",
    path: "/oauth2/get-consents",
    signedIn: true,
    operationId: "connectedApps",
    summary: "Connected applications",
    description: "Your approved application grants.",
    responseExample: [],
  },
  {
    method: "POST",
    path: "/oauth2/delete-consent",
    signedIn: true,
    operationId: "disconnectApp",
    requestExample: { id: "01900000-0000-7000-8000-000000000001" },
    summary: "Disconnect an application",
    description: "Revokes a grant and its access and refresh tokens.",
    responseExample: { status: true },
  },
] as const

export const OAUTH_PROTOCOL_ENDPOINTS = [
  {
    method: "POST",
    path: "/oauth2/token",
    signedIn: false,
    operationId: "oauthToken",
    requestExample: {
      grant_type: "authorization_code",
      client_id: "example-client",
      code: "authorization-code",
      code_verifier: "pkce-verifier",
      redirect_uri: "https://client.example.com/callback",
      resource: "https://meals.example.com/api",
    },
    summary: "Exchange an authorization code or refresh token",
    description:
      "Client authentication and PKCE apply. Tokens belong to one household and one resource.",
    responseExample: {
      access_token: "mro_example",
      token_type: "Bearer",
      expires_in: 600,
      scope: "recipes:read",
    },
  },
  {
    method: "POST",
    path: "/oauth2/register",
    signedIn: false,
    operationId: "registerOAuthClient",
    summary: "Register an OAuth client",
    description:
      "Dynamic client registration does not grant household access. A person must approve access.",
    requestExample: {
      client_name: "Kitchen app",
      redirect_uris: ["https://client.example.com/callback"],
      token_endpoint_auth_method: "none",
    },
    responseExample: {
      client_id: "example-client",
      redirect_uris: ["https://client.example.com/callback"],
    },
  },
  {
    method: "POST",
    path: "/oauth2/revoke",
    signedIn: false,
    operationId: "revokeOAuthToken",
    requestExample: { token: "mro_example" },
    summary: "Revoke a token",
    description:
      "Revokes an access or refresh token using its client's authentication.",
    responseExample: {},
  },
  {
    method: "POST",
    path: "/oauth2/introspect",
    signedIn: false,
    operationId: "introspectOAuthToken",
    requestExample: { token: "mro_example" },
    summary: "Inspect a token",
    description: "Authenticated client introspection.",
    responseExample: { active: false },
  },
] as const
