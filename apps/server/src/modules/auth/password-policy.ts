import type { EntityManager } from "@mikro-orm/sql"
import type { Config } from "../../core/config.ts"
import type { Settings } from "../../services/settings/settings.ts"
import { Account, Passkey } from "../../database/entities/index.ts"
import { AUTH_SECURITY } from "./settings.ts"
import { oidcConfiguration } from "./oidc.ts"
import { passkeyOrigin } from "./origin.ts"

/** Keep password recovery available until an administrator has proved an alternative works. */
export async function passwordSignInAllowed(
  em: EntityManager,
  config: Config,
  settings: Settings
) {
  if (await settings.server(AUTH_SECURITY.passwords)) return true
  if (
    oidcConfiguration(config) &&
    (await em.count(Account, {
      providerId: "oidc",
      user: { role: "admin", banned: { $ne: true } },
    }))
  )
    return false
  if (
    passkeyOrigin(config.publicUrl) &&
    (await settings.server(AUTH_SECURITY.passkeys)) &&
    (await em.count(Passkey, {
      user: { role: "admin", banned: { $ne: true } },
    }))
  )
    return false
  return true
}
