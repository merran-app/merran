import type { EntityManager } from "@mikro-orm/sql"
import { Secret, Webhook, WebhookEvent } from "../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../database/scope.ts"

/** How long events, and their deliveries, stay in the deliveries log. */
export const KEEP_WEBHOOK_EVENTS_DAYS = 30

/**
 * For the daily clean-up: clears events older than a month, with their
 * deliveries, and the secrets that stopped signing a day after a rotation.
 * Returns how many events went.
 */
export async function clearOldWebhookEvents(em: EntityManager) {
  const before = new Date(
    Date.now() - KEEP_WEBHOOK_EVENTS_DAYS * 24 * 60 * 60 * 1000
  )
  // Their deliveries go with them, by the foreign key.
  const removed = await em.nativeDelete(
    WebhookEvent,
    { createdAt: { $lt: before } },
    ACROSS_HOUSEHOLDS
  )
  await clearPreviousSecrets(em)
  return removed
}

async function clearPreviousSecrets(em: EntityManager) {
  const rotated = await em.find(
    Webhook,
    { previousSecretUntil: { $lte: new Date() } },
    ACROSS_HOUSEHOLDS
  )
  for (const webhook of rotated) {
    const secretId = webhook.previousSecret?.id
    await em.nativeUpdate(
      Webhook,
      { id: webhook.id },
      { previousSecret: null, previousSecretUntil: null },
      ACROSS_HOUSEHOLDS
    )
    if (secretId) await em.nativeDelete(Secret, { id: secretId })
  }
}
