import type { WebhookEventType } from "@merran/shared"
import { ref, type Ref } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import type { AppDeps } from "../../core/context.ts"
import { AppError } from "../../core/errors.ts"
import {
  Secret,
  Webhook,
  WebhookDelivery,
} from "../../database/entities/index.ts"
import { checkWebhookAddress, homeNetworkAllowed } from "./addresses.ts"
import { attemptDelivery, isMerransHeader } from "./deliver.ts"
import { pauseWebhook, resumeWebhook } from "./pausing.ts"
import { cancelDeliveryJobs, record, requeueDelivery } from "./record.ts"
import { newWebhookSecret } from "./signing.ts"
import { webhooksEnabled } from "./state.ts"
import { forgetWebhooks } from "./wanted.ts"

// A household's webhooks, managed by its owners and admins in the app
// (docs/webhooks.md, "The page" and "The API"). Each change forgets what
// the household's webhooks want once it's saved, never inside a
// transaction, so an event recorded meanwhile can't keep the old state.

/** Enough for every tool in a home, and a bound on what one household can make the server send. */
const MAX_WEBHOOKS = 10

/** How long the secret before a rotation still signs, so a receiver can change over. */
const PREVIOUS_SECRET_MS = 24 * 60 * 60_000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A header of the household's own, sent with each delivery. */
export type WebhookHeader = { name: string; value: string }

/** What the Add webhook form sends. */
export type WebhookInput = {
  name: string
  address: string
  events: WebhookEventType[]
  everything: boolean
  headers: WebhookHeader[]
}

/** What editing a webhook can change, and pausing or resuming it. */
export type WebhookChanges = Partial<WebhookInput> & {
  paused?: boolean
  /** On resuming, also send again what didn't arrive in the last day. */
  resend?: boolean
}

type SealDeps = Pick<AppDeps, "settings">
type ChangeDeps = Pick<AppDeps, "settings" | "logger" | "config">
type SendDeps = Pick<AppDeps, "settings" | "fetcher" | "logger" | "config">

/** Refuses while the server admin has turned webhooks off. */
export function requireWebhooks() {
  if (!webhooksEnabled()) throw webhooksOff()
}

const webhooksOff = () =>
  new AppError(
    "forbidden",
    "webhooks_off",
    "Webhooks are turned off on this server."
  )

/** The household's webhooks, in the order they were added. */
export function listWebhooks(em: EntityManager) {
  return em.find(Webhook, {}, { orderBy: { createdAt: "asc", id: "asc" } })
}

/**
 * One of the household's webhooks, with its sealed parts loaded. `em` sees
 * only the household, so another household's webhook isn't found.
 */
export async function findWebhook(em: EntityManager, id: string) {
  const webhook = UUID.test(id)
    ? await em.findOne(
        Webhook,
        { id },
        { populate: ["address", "secret", "previousSecret", "headers"] }
      )
    : null
  if (!webhook) {
    throw new AppError(
      "not_found",
      "webhook_not_found",
      "There's no such webhook."
    )
  }
  return webhook
}

/**
 * Adds a webhook with a new signing secret, which is returned to show
 * once. The address is checked before anything is saved: a household the
 * server admin hasn't allowed must give one that leads only to public
 * addresses.
 */
export async function createWebhook(
  em: EntityManager,
  deps: SealDeps,
  input: { householdId: string; userId: string; webhook: WebhookInput }
): Promise<{ webhook: Webhook; secret: string }> {
  const { householdId, webhook: wanted } = input
  checkEvents(wanted)
  checkHeaders(wanted.headers)
  const count = await em.count(Webhook, { household: householdId })
  if (count >= MAX_WEBHOOKS) {
    throw new AppError(
      "conflict",
      "too_many_webhooks",
      "A household can have up to 10 webhooks."
    )
  }
  const address = await checkAddress(deps, householdId, wanted.address)

  const secret = newWebhookSecret()
  const webhook = em.create(Webhook, {
    household: householdId,
    name: wanted.name,
    host: address.host,
    address: seal(em, deps, address.href),
    secret: seal(em, deps, secret),
    headers:
      wanted.headers.length > 0
        ? seal(em, deps, sealedHeaders(wanted.headers))
        : null,
    headerNames: wanted.headers.map((header) => header.name),
    events: unique(wanted.events),
    everything: wanted.everything,
    createdBy: input.userId,
  })
  await em.flush()
  forgetWebhooks(householdId)
  return { webhook, secret }
}

/**
 * Changes a webhook. A new address is checked as when adding one, and
 * everything is checked before anything is saved. Then `paused` pauses it
 * by hand, or resumes it, resending what didn't arrive in the last day if
 * asked.
 */
export async function updateWebhook(
  em: EntityManager,
  deps: ChangeDeps,
  input: { householdId: string; webhook: Webhook; changes: WebhookChanges }
): Promise<Webhook> {
  const { householdId, webhook, changes } = input
  checkEvents({
    events: changes.events ?? webhook.events,
    everything: changes.everything ?? webhook.everything,
  })
  if (changes.headers) checkHeaders(changes.headers)
  const address = addressChanged(deps, webhook, changes.address)
    ? await checkAddress(deps, householdId, changes.address)
    : null

  if (changes.name !== undefined) webhook.name = changes.name
  if (address) {
    webhook.host = address.host
    webhook.address = reseal(em, deps, webhook.address, address.href)
  }
  if (changes.events !== undefined) webhook.events = unique(changes.events)
  if (changes.everything !== undefined) {
    webhook.everything = changes.everything
  }
  if (changes.headers !== undefined) {
    replaceHeaders(em, deps, webhook, changes.headers)
  }
  await em.flush()
  forgetWebhooks(householdId)

  // Pausing and resuming save their change, and forget, themselves.
  if (changes.paused === true && webhook.state === "active") {
    await pauseWebhook(em, deps, webhook, "by_hand")
  } else if (changes.paused === false && webhook.state === "paused") {
    await resumeWebhook(em, webhook, { resend: changes.resend ?? false })
  }
  return webhook
}

/**
 * Deletes a webhook, with its sealed address, secrets and headers, which
 * nothing else points at. Its deliveries go with it, by the foreign key,
 * and the jobs that would have tried them are cancelled.
 */
export async function deleteWebhook(em: EntityManager, webhook: Webhook) {
  const waiting = await em.find(
    WebhookDelivery,
    { webhook: webhook.id, state: "waiting" },
    { fields: ["id"] }
  )
  const sealed = [
    webhook.address,
    webhook.secret,
    webhook.previousSecret,
    webhook.headers,
  ]
  for (const secret of sealed) {
    if (secret) em.remove(em.getReference(Secret, secret.id))
  }
  em.remove(webhook)
  await em.flush()
  forgetWebhooks(webhook.household.id)

  await cancelDeliveryJobs(
    em,
    waiting.map((delivery) => delivery.id)
  )
}

/** Where a webhook sends. It's sealed, since it's often the receiver's password. */
export function webhookAddress(deps: SealDeps, webhook: Webhook): string {
  return openSealed(deps, webhook.address)
}

/** The secret its deliveries are signed with now. */
export function webhookSecret(deps: SealDeps, webhook: Webhook): string {
  return openSealed(deps, webhook.secret)
}

/**
 * Makes a new signing secret, and returns it. The one it replaces still
 * signs for a day, so a receiver can change over without missing a
 * delivery; the one before that goes.
 */
export async function rotateWebhookSecret(
  em: EntityManager,
  deps: SealDeps,
  webhook: Webhook
): Promise<string> {
  const replaced = webhook.previousSecret
  const secret = newWebhookSecret()

  webhook.previousSecret = webhook.secret
  webhook.previousSecretUntil = webhook.secret
    ? new Date(Date.now() + PREVIOUS_SECRET_MS)
    : null
  webhook.secret = ref(seal(em, deps, secret))
  if (replaced) em.remove(em.getReference(Secret, replaced.id))
  await em.flush()

  forgetWebhooks(webhook.household.id)
  return secret
}

/** A page of a webhook's deliveries, newest first, and how many it has. */
export async function listDeliveries(
  em: EntityManager,
  webhookId: string,
  page: { limit: number; offset: number }
): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
  const [deliveries, total] = await em.findAndCount(
    WebhookDelivery,
    { webhook: webhookId },
    {
      orderBy: { createdAt: "desc", id: "desc" },
      limit: page.limit,
      offset: page.offset,
      populate: ["event"],
    }
  )
  return { deliveries, total }
}

/** One of a webhook's deliveries, with its event and webhook. */
export async function findDelivery(
  em: EntityManager,
  webhook: Webhook,
  id: string
) {
  const delivery = UUID.test(id)
    ? await em.findOne(
        WebhookDelivery,
        { id, webhook: webhook.id },
        { populate: ["event", "webhook"] }
      )
    : null
  if (!delivery) {
    throw new AppError(
      "not_found",
      "delivery_not_found",
      "There's no such delivery."
    )
  }
  return delivery
}

/**
 * Sends a delivery again, from its first try. One still being tried, or
 * one for a paused webhook, which would only be stopped again, can't be.
 */
export async function resendDelivery(
  em: EntityManager,
  delivery: WebhookDelivery
): Promise<WebhookDelivery> {
  if (delivery.state === "waiting") {
    throw new AppError(
      "conflict",
      "delivery_waiting",
      "That delivery is still being tried."
    )
  }
  if (delivery.webhook.getEntity().state === "paused") {
    throw new AppError(
      "conflict",
      "webhook_paused",
      "Resume the webhook first."
    )
  }

  delivery.state = "waiting"
  delivery.tries = 0
  await em.flush()
  await requeueDelivery(em, {
    householdId: delivery.household.id,
    deliveryId: delivery.id,
  })
  return delivery
}

/**
 * Send a test: a `webhook.test` event for this webhook alone, tried once
 * now, even when it's paused, and returned with what came of it. It's
 * never retried, and never changes how the webhook is doing.
 */
export async function sendTest(
  em: EntityManager,
  deps: SendDeps,
  input: { householdId: string; webhook: Webhook }
): Promise<WebhookDelivery> {
  const { householdId, webhook } = input
  const event = await record(em, householdId, {
    type: "webhook.test",
    data: { webhook: { id: webhook.id, name: webhook.name } },
    only: webhook.id,
  })
  // Nothing is recorded only when webhooks were turned off since the route checked.
  if (!event) throw webhooksOff()

  const delivery = await em.findOneOrFail(
    WebhookDelivery,
    { event: event.id, webhook: webhook.id },
    { populate: ["event"] }
  )
  await attemptDelivery(em, deps, delivery.id, { final: true, test: true })
  return delivery
}

/** Refuses a webhook that wants nothing. */
function checkEvents(webhook: {
  events: readonly string[]
  everything: boolean
}) {
  if (webhook.everything || webhook.events.length > 0) return

  const message = "Pick at least one event."
  throw new AppError("invalid", "webhook_events", message, { events: message })
}

/** Refuses a header that would replace one Merran sets, however it's written. */
function checkHeaders(headers: readonly WebhookHeader[]) {
  if (!headers.some((header) => isMerransHeader(header.name))) return

  const message = "That header is one Merran sets itself."
  throw new AppError("invalid", "webhook_headers", message, {
    headers: message,
  })
}

/** Checks an address against the rules for this household's webhooks. */
async function checkAddress(
  deps: SealDeps,
  householdId: string,
  address: string
) {
  return checkWebhookAddress(address, {
    homeNetwork: await homeNetworkAllowed(deps.settings, householdId),
  })
}

/**
 * Whether an edit gives a different address. An unchanged one isn't
 * checked again; one that can't be opened any more is replaced.
 */
function addressChanged(
  deps: SealDeps,
  webhook: Webhook,
  address: string | undefined
): address is string {
  if (address === undefined) return false
  try {
    return address !== webhookAddress(deps, webhook)
  } catch {
    return true
  }
}

/** The headers as the delivery code reads them: JSON, `[{ name, value }]`. */
function sealedHeaders(headers: readonly WebhookHeader[]) {
  return JSON.stringify(
    headers.map((header) => ({ name: header.name, value: header.value }))
  )
}

/** Replaces a webhook's extra headers; none removes their secret. */
function replaceHeaders(
  em: EntityManager,
  deps: SealDeps,
  webhook: Webhook,
  headers: readonly WebhookHeader[]
) {
  webhook.headerNames = headers.map((header) => header.name)
  if (headers.length > 0) {
    webhook.headers = reseal(em, deps, webhook.headers, sealedHeaders(headers))
    return
  }

  const kept = webhook.headers
  webhook.headers = null
  if (kept) em.remove(em.getReference(Secret, kept.id))
}

/** A new secret row holding `value`, sealed. */
function seal(em: EntityManager, deps: SealDeps, value: string) {
  return em.create(Secret, deps.settings.seal(value))
}

/** Seals `value` into the secret row a webhook has there already, or a new one. */
function reseal(
  em: EntityManager,
  deps: SealDeps,
  kept: Ref<Secret> | null | undefined,
  value: string
): Ref<Secret> {
  if (!kept) return ref(seal(em, deps, value))

  Object.assign(kept.getEntity(), deps.settings.seal(value))
  return kept
}

function openSealed(deps: SealDeps, sealed: Ref<Secret> | null | undefined) {
  if (!sealed) throw new Error("The webhook's sealed part is missing.")
  return deps.settings.open(sealed.getEntity())
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}
