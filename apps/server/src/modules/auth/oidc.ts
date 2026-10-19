import type { Config } from "../../core/config.ts"
import { AUTH_SECURITY } from "./settings.ts"

export function oidcConfiguration(
  config: Pick<Config, "publicUrl"> & Partial<Pick<Config, "fromEnv">>
) {
  const read = (key: string) => config.fromEnv?.get(key)
  const discoveryUrl = read(AUTH_SECURITY.oidcDiscovery.key) as
    string | undefined
  const clientId = read(AUTH_SECURITY.oidcClientId.key) as string | undefined
  if (!discoveryUrl && !clientId) return null
  if (!config.publicUrl || !discoveryUrl || !clientId)
    throw new Error(
      "OIDC needs MERRAN_PUBLIC_URL, MERRAN_AUTH_OIDC_DISCOVERY and MERRAN_AUTH_OIDC_CLIENT_ID."
    )
  return {
    providerId: "oidc",
    name: "Single sign-on",
    discoveryUrl,
    clientId,
    clientSecret: read(AUTH_SECURITY.oidcClientSecret.key) as
      string | undefined,
    scopes: ["openid", "profile", "email"],
    requireIdTokenVerification: true,
    pkce: true,
    disableSignUp: read(AUTH_SECURITY.oidcAllowSignup.key) !== true,
    overrideUserInfo: false,
    disableProviderLogout: true,
  }
}
