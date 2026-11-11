import type { WebhookEventType } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  Household,
  WebhookDelivery,
  WebhookEvent,
} from "../../database/entities/index.ts"
import { enqueue } from "../jobs/jobs.ts"
import { currentActor, type Actor } from "./actor.ts"
import type { EventData } from "./payloads.ts"
import { webhooksEnabled } from "./state.ts"
import { webhooksWanting } from "./wanted.ts"

/** The job that sends one delivery; its payload is only the delivery's id. */
export const WEBHOOK_DELIVERY_JOB = "webhooks.deliver"

/**
 * At once, then the seven waits Standard Webhooks recommends: about 27
 * hours, enough to ride out a night of Home Assistant being down.
 */
export const WEBHOOK_MAX_ATTEMPTS = 8

/**
 * Tells the household's webhooks that something happened. Called with the
 * entity manager of the transaction that makes the change, so a change that
 * rolls back sends nothing, and a restart loses nothing.
 *
 * When webhooks are off, or no active webhook wants the event, it writes
 * nothing and returns null. Otherwise it saves the event, a delivery for
 * each webhook that wants it, and a job to send each.
 */
export async function record<T extends WebhookEventType>(
  em: EntityManager,
  householdId: string,
  event: {
    type: T
    data: EventData<T>
    /** Who did it, when it isn't whoever sent the request (or Merran). */
    actor?: Actor
    /** One webhook only, with no job: Send a test tries it straight away. */
    only?: string
  }
): Promise<WebhookEvent | null> {
  if (!webhooksEnabled()) return null
  // Send a test goes to the one webhook, even when it's paused.
  const webhookIds = event.only
    ? [event.only]
    : await webhooksWanting(em, householdId, event.type)
  if (webhookIds.length === 0) return null

  const household = await em.findOneOrFail(Household, { id: householdId })
  const saved = em.create(WebhookEvent, {
    household: householdId,
    type: event.type,
    payload: {
      household: { id: household.id, name: household.name },
      ...(event.actor ?? currentActor()),
      ...event.data,
    },
  })
  const deliveries = webhookIds.map((webhookId) =>
    em.create(WebhookDelivery, {
      household: householdId,
      webhook: webhookId,
      event: saved,
    })
  )
  await em.flush()

  if (!event.only) {
    for (const delivery of deliveries) {
      await enqueue(em, {
        kind: WEBHOOK_DELIVERY_JOB,
        householdId,
        payload: { deliveryId: delivery.id },
        maxAttempts: WEBHOOK_MAX_ATTEMPTS,
      })
    }
  }
  return saved
}
