import { createHmac, randomBytes } from "node:crypto"

const SECRET_PREFIX = "whsec_"

/** A signing secret in the Standard Webhooks form: `whsec_` and 32 random bytes in base64. */
export function newWebhookSecret() {
  return SECRET_PREFIX + randomBytes(32).toString("base64")
}

/**
 * The `webhook-signature` header: one `v1,` signature per secret, separated by
 * spaces. There are several for the day after a rotation, so a receiver that
 * hasn't switched to the new secret yet still verifies the old one.
 */
export function signatureHeader(input: {
  id: string
  timestamp: number
  body: string
  secrets: readonly string[]
}) {
  const signed = `${input.id}.${input.timestamp}.${input.body}`

  return input.secrets
    .map((secret) => {
      // The key is the bytes behind the prefix, not the text of the secret.
      const key = Buffer.from(secret.slice(SECRET_PREFIX.length), "base64")
      const signature = createHmac("sha256", key)
        .update(signed)
        .digest("base64")

      return `v1,${signature}`
    })
    .join(" ")
}
