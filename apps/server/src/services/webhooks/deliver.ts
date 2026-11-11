import type { EntityManager } from "@mikro-orm/sql"
import {
  WebhookDelivery,
  type Webhook,
  type WebhookEvent,
} from "../../database/entities/index.ts"
import type { JobDeps, JobHandler } from "../jobs/runner.ts"
import { homeNetworkAllowed } from "./addresses.ts"
import { envelopeBody, messageId } from "./envelope.ts"
import { pauseWebhook } from "./pausing.ts"
import { WEBHOOK_DELIVERY_JOB } from "./record.ts"
import { signatureHeader } from "./signing.ts"
import { webhooksEnabled } from "./state.ts"

// Sending one delivery: signed as Standard Webhooks describes, through the
// public fetcher, so the rules on home-network addresses are the ones imports
// follow (docs/webhooks.md, "Delivery").

/**
 * How long to wait after each failed try: 5 seconds, 5 minutes, 30
 * minutes, 2 hours, 5 hours, 10 hours and 10 hours, as Standard Webhooks
 * recommends. With the first try, eight tries over about 27 hours.
 */
export const WEBHOOK_RETRY_DELAYS = [
  5_000, 300_000, 1_800_000, 7_200_000, 18_000_000, 36_000_000, 36_000_000,
] as const

/** How long a receiver has to answer. */
export const WEBHOOK_TIMEOUT_MS = 10_000

/** How much of an answer is kept for the deliveries log. */
export const ANSWER_KEPT = 1024

/** Headers Merran or its fetcher sets, besides every `webhook-` one. */
const MERRANS_HEADERS = new Set([
  "content-type",
  "content-length",
  "host",
  "user-agent",
])

/** Whether a header is one Merran sets itself, which a webhook's own can't replace. */
export function isMerransHeader(name: string) {
  const lower = name.toLowerCase()
  return MERRANS_HEADERS.has(lower) || lower.startsWith("webhook-")
}

/**
 * Headers fetch refuses or drops, so a delivery with one would fail or go
 * without it: those about one connection rather than the request, and
 * `expect`, which fetch refuses outright.
 */
const UNSENDABLE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
  "expect",
])

/** Whether a header can't be sent with a delivery, however it's written. */
export function isUnsendableHeader(name: string) {
  return UNSENDABLE_HEADERS.has(name.toLowerCase())
}

/**
 * What a try records when the webhook's sealed address, secrets or headers
 * can't be opened. It's always this, since what went wrong may quote them.
 */
const UNREADABLE =
  "Merran couldn't open this webhook's saved address, secret or headers."

/**
 * What came of a try: it arrived; it'll be tried again; it ran out of tries
 * (or was a test that failed); the receiver is gone; or there was nothing
 * to send, because it's gone, settled already, its webhook is paused or
 * webhooks are off.
 */
export type DeliveryOutcome =
  "delivered" | "retry" | "gave_up" | "gone" | "skipped"

type DeliveryDeps = Pick<JobDeps, "settings" | "fetcher" | "logger" | "config">

/** What one try got back: an answer, or the error that kept it from one. */
type TryResult = {
  statusCode: number | null
  answer: string | null
  error: string | null
  durationMs: number
  triedAt: Date
}

/**
 * Tries a waiting delivery once, and saves what came of it. A failure waits
 * for another try unless this is the `final` one, which pauses the webhook.
 * A `test` is sent even to a paused webhook. Whatever comes of a test,
 * sent now or resent later through its job, is the delivery's alone: it's
 * tried once, and never pauses the webhook or changes how it's doing.
 */
export async function attemptDelivery(
  em: EntityManager,
  deps: DeliveryDeps,
  deliveryId: string,
  options: { final: boolean; test?: boolean }
): Promise<DeliveryOutcome> {
  const delivery = await em.findOne(
    WebhookDelivery,
    { id: deliveryId },
    {
      populate: [
        "event",
        "webhook.address",
        "webhook.secret",
        "webhook.previousSecret",
        "webhook.headers",
      ],
    }
  )
  // Deleted with its webhook, or settled already by a resend or a test.
  if (!delivery || delivery.state !== "waiting") return "skipped"

  const webhook = delivery.webhook.getEntity()
  const sending = webhooksEnabled() && webhook.state === "active"
  if (!sending && !options.test) {
    delivery.state = "stopped"
    await em.flush()
    return "skipped"
  }

  const event = delivery.event.getEntity()
  const test = options.test === true || event.type === "webhook.test"

  // Read before sending, and saved after, so no transaction waits on the
  // receiver.
  const result = await tryOnce(deps, webhook, event)
  noteTry(delivery, result)

  if (isSuccess(result.statusCode)) {
    delivery.state = "delivered"
    delivery.deliveredAt = result.triedAt
    if (!test) {
      webhook.lastDeliveredAt = result.triedAt
      webhook.failingSince = null
      webhook.lastError = null
    }
    await em.flush()
    return "delivered"
  }

  if (test) {
    delivery.state = "failed"
    await em.flush()
    return "gave_up"
  }

  webhook.failingSince ??= result.triedAt
  webhook.lastError = result.error
  const gone = result.statusCode === 410
  if (!gone && !options.final) {
    await em.flush()
    return "retry"
  }

  delivery.state = "failed"
  await em.flush()
  await pauseWebhook(em, deps, webhook, gone ? "gone" : "gave_up")
  return gone ? "gone" : "gave_up"
}

/**
 * One try: open what's sealed, sign, send. A webhook whose sealed parts
 * can't be opened, because the server's key changed or one is missing,
 * fails the try like an address that can't be reached, so it's retried and
 * paused like any other rather than left waiting.
 */
async function tryOnce(
  deps: DeliveryDeps,
  webhook: Webhook,
  event: WebhookEvent
): Promise<TryResult> {
  let request: SignedRequest
  try {
    request = signedRequest(deps, webhook, event)
  } catch (error) {
    // Only its name: the message may quote what was sealed.
    deps.logger.warn(
      {
        webhook: webhook.id,
        error: error instanceof Error ? error.name : null,
      },
      "Couldn't open a webhook's saved address, secret or headers"
    )
    return {
      statusCode: null,
      answer: null,
      error: UNREADABLE,
      durationMs: 0,
      triedAt: new Date(),
    }
  }

  const homeNetwork = await homeNetworkAllowed(
    deps.settings,
    webhook.household.id
  )
  return send(deps, request, { homeNetwork })
}

type SignedRequest = {
  address: string
  body: string
  headers: Record<string, string>
}

/**
 * Opens the webhook's address, secrets and headers, and signs the event's
 * body. For the day after a rotation, the secret before signs too, so a
 * receiver that hasn't switched yet still verifies it.
 */
function signedRequest(
  deps: DeliveryDeps,
  webhook: Webhook,
  event: WebhookEvent
): SignedRequest {
  if (!webhook.address || !webhook.secret) {
    throw new Error("The webhook's sealed address or secret is missing.")
  }

  const secrets = [deps.settings.open(webhook.secret.getEntity())]
  const previousSecret = webhook.previousSecret?.getEntity()
  if (
    previousSecret &&
    webhook.previousSecretUntil &&
    webhook.previousSecretUntil > new Date()
  ) {
    secrets.push(deps.settings.open(previousSecret))
  }

  const id = messageId(event)
  const timestamp = Math.floor(Date.now() / 1000)
  const body = envelopeBody(event)
  return {
    address: deps.settings.open(webhook.address.getEntity()),
    body,
    headers: {
      ...extraHeaders(deps, webhook),
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": signatureHeader({ id, timestamp, body, secrets }),
    },
  }
}

/**
 * The headers the household added, sealed as JSON: `[{ name, value }]`.
 * Merran's own, and those fetch can't send, are left out however they were
 * saved, so one saved before saving refused it can't fail every delivery.
 * Names are made lowercase, so one like `Accept` replaces the fetcher's
 * rather than being sent alongside it.
 */
function extraHeaders(deps: DeliveryDeps, webhook: Webhook) {
  const sealed = webhook.headers?.getEntity()
  if (!sealed) return {}

  const headers = JSON.parse(deps.settings.open(sealed)) as {
    name: string
    value: string
  }[]
  return Object.fromEntries(
    headers
      .filter((header) => !isMerransHeader(header.name))
      .filter((header) => !isUnsendableHeader(header.name))
      .map((header) => [header.name.toLowerCase(), header.value])
  )
}

/**
 * POSTs the body as it was signed. An error answer is kept rather than
 * thrown, and anything thrown, like an address that can't be reached, is
 * link-local, or is on the home network when that isn't allowed, is the
 * try's error.
 */
async function send(
  deps: DeliveryDeps,
  request: SignedRequest,
  { homeNetwork }: { homeNetwork: boolean }
): Promise<TryResult> {
  const triedAt = new Date()
  const started = performance.now()
  const durationMs = () => Math.round(performance.now() - started)

  try {
    const answer = await deps.fetcher(request.address, {
      body: request.body,
      headers: request.headers,
      homeNetwork,
      // A household gave this address, not the server admin, so even on the
      // home network it never reaches the cloud metadata service.
      refuseLinkLocal: true,
      keepErrors: true,
      timeoutMs: WEBHOOK_TIMEOUT_MS,
      maxBytes: 1_000_000,
    })
    return {
      statusCode: answer.status,
      answer: keptAnswer(answer.body),
      error: isSuccess(answer.status)
        ? null
        : `That address answered with an error (${answer.status}).`,
      durationMs: durationMs(),
      triedAt,
    }
  } catch (error) {
    return {
      statusCode: null,
      answer: null,
      error: error instanceof Error ? error.message : String(error),
      durationMs: durationMs(),
      triedAt,
    }
  }
}

/**
 * The start of an answer, as text the deliveries log can keep. NUL
 * characters are left out: Postgres can't keep them in text, and a binary
 * or UTF-16 answer is full of them.
 */
function keptAnswer(body: Buffer) {
  return body.toString("utf8").replaceAll("\0", "").slice(0, ANSWER_KEPT)
}

/** Any 2xx is delivered; a redirect isn't followed, so it's a failure. */
function isSuccess(statusCode: number | null) {
  return statusCode !== null && statusCode >= 200 && statusCode < 300
}

/** What the deliveries log shows of the last try. */
function noteTry(delivery: WebhookDelivery, result: TryResult) {
  delivery.tries += 1
  delivery.statusCode = result.statusCode
  delivery.answer = result.answer
  delivery.durationMs = result.durationMs
  delivery.error = result.error
  delivery.lastTriedAt = result.triedAt
}

/**
 * Sends one delivery, two at a time across the server, on Standard
 * Webhooks' schedule: fewer than the runner's places, so receivers that
 * hang can't take them all. A try that fails is thrown, so the runner
 * waits for the next; the last one pauses the webhook instead.
 */
export const webhookDeliveryJob: JobHandler = {
  kind: WEBHOOK_DELIVERY_JOB,
  concurrency: 2,
  retryDelays: WEBHOOK_RETRY_DELAYS,
  async run({ em, payload, attempt, maxAttempts, deps }) {
    const deliveryId = payload.deliveryId
    if (typeof deliveryId !== "string") return

    const outcome = await attemptDelivery(em, deps, deliveryId, {
      final: attempt >= maxAttempts,
    })
    if (outcome === "retry") {
      // Already in hand: attemptDelivery loaded it into this entity manager.
      const delivery = await em.findOneOrFail(WebhookDelivery, {
        id: deliveryId,
      })
      throw new Error(delivery.error ?? "The delivery failed.")
    }
    return { outcome }
  },
}
