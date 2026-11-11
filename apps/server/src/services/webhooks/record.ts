import type { WebhookEventType } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  Household,
  Job,
  WebhookDelivery,
  WebhookEvent,
} from "../../database/entities/index.ts"
import {
  ACTIVE,
  createJob,
  enqueue,
  restartJob,
  wakeRunner,
  type NewJob,
} from "../jobs/jobs.ts"
import { currentActor, type Actor } from "./actor.ts"
import {
  isEmptyPart,
  isGathered,
  queueGathering,
  type GatheredEventType,
  type GatheredPart,
} from "./gathering/gathering.ts"
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
 * What a change records: for a gathered event, its part of what's merged
 * and sent later; for any other, the whole event.
 */
export type RecordedData<T extends WebhookEventType> =
  T extends GatheredEventType ? GatheredPart<T> : EventData<T>

/**
 * Tells the household's webhooks that something happened. Called with the
 * entity manager of the transaction that makes the change, so a change that
 * rolls back sends nothing, and a restart loses nothing.
 *
 * When webhooks are off, or no active webhook wants the event, it writes
 * nothing and returns null. A busy event's change is gathered, to be merged
 * with the others like it and sent within 30 seconds (gathering/); any
 * other event is sent at once.
 */
export async function record<T extends WebhookEventType>(
  em: EntityManager,
  householdId: string,
  event: {
    type: T
    data: RecordedData<T>
    /** Who did it, when it isn't whoever sent the request (or Merran). */
    actor?: Actor
    /** One webhook only, with no job: Send a test tries it straight away. */
    only?: string
  }
): Promise<WebhookEvent | null> {
  // TypeScript doesn't narrow `data` along with `type`, so each path is
  // told which it has.
  if (isGathered(event.type) && !event.only) {
    return gatherChange(em, householdId, {
      type: event.type,
      part: event.data as GatheredPart<GatheredEventType>,
      actor: event.actor,
    })
  }
  return sendEvent(em, householdId, {
    ...event,
    data: event.data as EventData<T>,
  })
}

/**
 * Sends an event: saves it, a delivery for each webhook that wants it, and
 * a job to send each, all in one flush, so even outside a transaction no
 * delivery is left without its job. Like `record`, it writes nothing and
 * returns null when webhooks are off or no active webhook wants the event.
 * The merge job sends gathered changes through here once they're merged.
 */
export async function sendEvent<T extends WebhookEventType>(
  em: EntityManager,
  householdId: string,
  event: {
    type: T
    data: EventData<T>
    /** Who did it, when it isn't whoever sent the request (or Merran). */
    actor?: Actor
    /** One webhook only, with no job, for Send a test. */
    only?: string
  }
): Promise<WebhookEvent | null> {
  const webhookIds = await webhooksFor(em, householdId, event)
  if (webhookIds.length === 0) return null

  const saved = em.create(WebhookEvent, {
    household: householdId,
    type: event.type,
    payload: await payloadOf(em, householdId, event),
  })
  const deliveries = webhookIds.map((webhookId) =>
    em.create(WebhookDelivery, {
      household: householdId,
      webhook: webhookId,
      event: saved,
    })
  )
  if (!event.only) {
    // Each delivery is new, so no job can have its key yet.
    for (const delivery of deliveries) {
      createJob(em, deliveryJob({ householdId, deliveryId: delivery.id }))
    }
  }
  await em.flush()

  if (!event.only) wakeRunner()
  return saved
}

/**
 * Saves one change to a gathered event, with no deliveries, and makes sure
 * a job will merge it with the others like it. A change that counts nothing
 * isn't saved.
 */
async function gatherChange(
  em: EntityManager,
  householdId: string,
  change: {
    type: GatheredEventType
    part: GatheredPart<GatheredEventType>
    actor?: Actor
  }
): Promise<WebhookEvent | null> {
  if (isEmptyPart(change.part)) return null
  const webhookIds = await webhooksFor(em, householdId, change)
  if (webhookIds.length === 0) return null

  const saved = em.create(WebhookEvent, {
    household: householdId,
    type: change.type,
    gathered: true,
    payload: await payloadOf(em, householdId, {
      actor: change.actor,
      data: change.part,
    }),
  })
  // Saved before its job is looked for, so outside a transaction any merge
  // that starts from then on reads it. A crash before the job is saved
  // leaves it for the next change's merge.
  await em.flush()
  await queueGathering(em, householdId, change.type)
  await em.flush()
  return saved
}

/** The webhooks an event goes to: none while webhooks are off. */
async function webhooksFor(
  em: EntityManager,
  householdId: string,
  event: { type: WebhookEventType; only?: string }
): Promise<string[]> {
  if (!webhooksEnabled()) return []
  // Send a test goes to the one webhook, even when it's paused.
  if (event.only) return [event.only]
  return webhooksWanting(em, householdId, event.type)
}

/** What an event carries: whose household, who did it, then its own data. */
async function payloadOf(
  em: EntityManager,
  householdId: string,
  event: { actor?: Actor; data: object }
): Promise<Record<string, unknown>> {
  const household = await em.findOneOrFail(Household, { id: householdId })
  return {
    household: { id: household.id, name: household.name },
    ...(event.actor ?? currentActor()),
    ...event.data,
  }
}

// Each delivery has at most one job waiting or running, found by its key,
// so pausing can cancel it and sending again starts it over, rather than an
// old job turning up later to send it twice.

const deliveryJobKey = (deliveryId: string) =>
  `${WEBHOOK_DELIVERY_JOB}:${deliveryId}`

type DeliveryRef = { householdId: string; deliveryId: string }

/** The job that sends a delivery: eight tries, found again by its key. */
function deliveryJob(input: DeliveryRef): NewJob {
  return {
    kind: WEBHOOK_DELIVERY_JOB,
    key: deliveryJobKey(input.deliveryId),
    householdId: input.householdId,
    payload: { deliveryId: input.deliveryId },
    maxAttempts: WEBHOOK_MAX_ATTEMPTS,
  }
}

/** Queues the job that sends a delivery, unless it has one already. */
export function queueDelivery(
  em: EntityManager,
  input: DeliveryRef
): Promise<Job> {
  return enqueue(em, deliveryJob(input))
}

/** The job waiting or running to send a delivery, if it has one. */
export function activeDeliveryJob(em: EntityManager, deliveryId: string) {
  return em.findOne(Job, {
    key: deliveryJobKey(deliveryId),
    status: { $in: [...ACTIVE] },
  })
}

/**
 * Sends a delivery again from its first try, now: for Resume and Resend.
 * A job it still has, waiting or running, starts over; otherwise it gets a
 * new one.
 */
export async function requeueDelivery(
  em: EntityManager,
  input: DeliveryRef
): Promise<Job> {
  const job = await activeDeliveryJob(em, input.deliveryId)
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
