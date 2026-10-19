import type { EntityManager } from "@mikro-orm/sql"
import {
  symmetricDecrypt,
  symmetricEncrypt,
  parseEnvelope,
} from "better-auth/crypto"
import {
  Account,
  OauthClient,
  TwoFactor,
} from "../../database/entities/index.ts"

/** Better Auth owns these encrypted formats, so rotate them with its own crypto. */
export async function rotateAuthSecrets(
  em: EntityManager,
  from: string,
  to: string
) {
  const rewrap = async (value: string) => {
    const envelope = parseEnvelope(value)
    const key = (secret: string) =>
      envelope
        ? {
            currentVersion: envelope.version,
            keys: new Map([[envelope.version, secret]]),
            legacySecret: secret,
          }
        : secret
    try {
      const plaintext = await symmetricDecrypt({ key: key(from), data: value })
      return await symmetricEncrypt({ key: key(to), data: plaintext })
    } catch {
      // Re-running after a successful rotation must not corrupt already rotated material.
      await symmetricDecrypt({ key: key(to), data: value })
      return value
    }
  }
  for (const factor of await em.find(TwoFactor, {})) {
    factor.secret = await rewrap(factor.secret)
    factor.backupCodes = await rewrap(factor.backupCodes)
  }
  for (const client of await em.find(OauthClient, {
    clientSecret: { $ne: null },
  }))
    client.clientSecret = await rewrap(client.clientSecret!)
  for (const account of await em.find(Account, {
    providerId: { $ne: "credential" },
  })) {
    for (const field of ["accessToken", "refreshToken"] as const) {
      if (account[field]) account[field] = await rewrap(account[field])
    }
  }
  await em.flush()
}
