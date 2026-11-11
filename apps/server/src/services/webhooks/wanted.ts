import type { WebhookEventType } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { Webhook } from "../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../database/scope.ts"

// Every change asks whether a webhook wants to hear of it, and most
// households have none, so what each household's webhooks want is kept in
// memory until its webhooks change. A household without webhooks then
// pays nothing.

type ActiveWebhook = { id: string; events: string[]; everything: boolean }

/**
 * Each household's active webhooks. The read is kept, not just what it
 * found, so a household forgotten while its read is under way reads again.
 */
const kept = new Map<string, Promise<ActiveWebhook[]>>()

/** The ids of the household's active webhooks that want `type`. */
export async function webhooksWanting(
  em: EntityManager,
  householdId: string,
  type: WebhookEventType
): Promise<string[]> {
  const webhooks = await activeWebhooks(em, householdId)
  return webhooks
    .filter((webhook) => webhook.everything || webhook.events.includes(type))
    .map((webhook) => webhook.id)
}

/** Forgets what the household's webhooks want, whenever they change. */
export function forgetWebhooks(householdId: string) {
  kept.delete(householdId)
}

function activeWebhooks(em: EntityManager, householdId: string) {
  const known = kept.get(householdId)
  if (known) return known

  const reading = readActiveWebhooks(em, householdId)
  kept.set(householdId, reading)
  // A read that failed isn't kept, so the next change tries again.
  reading.catch(() => {
    if (kept.get(householdId) === reading) kept.delete(householdId)
  })
  return reading
}

/**
 * Reads straight from the household's rows. `em` may be a route's, scoped
 * to the household, or a job's, scoped to none, so the household is in the
 * condition and its filter is set aside.
 */
async function readActiveWebhooks(
  em: EntityManager,
  householdId: string
): Promise<ActiveWebhook[]> {
  const webhooks = await em.find(
    Webhook,
    { household: householdId, state: "active" },
    ACROSS_HOUSEHOLDS
  )
  return webhooks.map((webhook) => ({
    id: webhook.id,
    events: webhook.events,
    everything: webhook.everything,
  }))
}
