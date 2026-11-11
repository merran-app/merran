import type { WebhookEventType } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  Household,
  Job,
  WebhookDelivery,
  WebhookEvent,
} from "../../database/entities/index.ts"
import { ACTIVE, enqueue, restartJob } from "../jobs/jobs.ts"
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
      await queueDelivery(em, { householdId, deliveryId: delivery.id })
    }
  }
  return saved
}

// Each delivery has at most one job waiting or running, found by its key,
// so pausing can cancel it and sending again starts it over, rather than an
// old job turning up later to send it twice.

const deliveryJobKey = (deliveryId: string) =>
  `${WEBHOOK_DELIVERY_JOB}:${deliveryId}`

/** Queues the job that sends a delivery, unless it has one already. */
export function queueDelivery(
  em: EntityManager,
  input: { householdId: string; deliveryId: string }
): Promise<Job> {
  return enqueue(em, {
    kind: WEBHOOK_DELIVERY_JOB,
    key: deliveryJobKey(input.deliveryId),
    householdId: input.householdId,
    payload: { deliveryId: input.deliveryId },
    maxAttempts: WEBHOOK_MAX_ATTEMPTS,
  })
}

/**
 * Sends a delivery again from its first try, now: for Resume and Resend.
 * A job it still has, waiting or running, starts over; otherwise it gets a
 * new one.
 */
export async function requeueDelivery(
  em: EntityManager,
  input: { householdId: string; deliveryId: string }
): Promise<Job> {
  const job = await em.findOne(Job, {
    key: deliveryJobKey(input.deliveryId),
    status: { $in: [...ACTIVE] },
  })
  return job ? restartJob(em, job) : queueDelivery(em, input)
}

/** Cancels the waiting jobs of deliveries that won't be sent. One running finishes its try. */
export async function cancelDeliveryJobs(
  em: EntityManager,
  deliveryIds: readonly string[]
) {
  if (deliveryIds.length === 0) return
  await em.nativeUpdate(
    Job,
    { key: { $in: deliveryIds.map(deliveryJobKey) }, status: "queued" },
    { status: "cancelled", finishedAt: new Date() }
  )
}
