import type { Module } from "../module.ts"
import { AUTH_SECURITY } from "./settings.ts"
import { oidcConfiguration } from "./oidc.ts"
import { passwordSignInAllowed } from "./password-policy.ts"
import { passkeyOrigin } from "./origin.ts"

export { passkeyOrigin } from "./origin.ts"

export const authentication: Module = {
  id: "auth",
  settings: Object.values(AUTH_SECURITY),
  async status() {
    return { on: true }
  },
  async capabilities({ config, settings, database }) {
    const capabilities: string[] = []
    if (await passwordSignInAllowed(database.em.fork(), config, settings))
      capabilities.push("auth.passwords")
    if (config.fromEnv.get("auth.oauth") === true && config.publicUrl)
      capabilities.push("auth.oauth")
    if (oidcConfiguration(config)) capabilities.push("auth.sso")
    if (
      (await settings.server(AUTH_SECURITY.passkeys)) &&
      passkeyOrigin(config.publicUrl)
    )
      capabilities.push("auth.passkeys")
    if (
      (await settings.server(AUTH_SECURITY.twoFactor)) ||
      (await settings.server(AUTH_SECURITY.requireAdminTwoFactor))
    )
      capabilities.push("auth.twoFactor")
    return capabilities
  },
}
