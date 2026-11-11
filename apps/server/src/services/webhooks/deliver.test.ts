import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { Webhook as SignedWebhook } from "standardwebhooks"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import {
  Household,
  Job,
  Secret,
  Webhook,
  WebhookDelivery,
  WebhookEvent,
} from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { forHousehold } from "../../database/scope.ts"
import { webhookPausedEmail } from "../../modules/email/templates.ts"
import { createTestApp, setUpServer } from "../../test/app.ts"
import {
  startReceiver,
  type ReceivedRequest,
  type Receiver,
} from "../../test/webhook-receiver.ts"
import { createPublicFetcher, type Fetcher } from "../fetch/public-fetch.ts"
import { enqueue } from "../jobs/jobs.ts"
import type { JobRunner } from "../jobs/runner.ts"
import type { Settings } from "../settings/settings.ts"
import { checkWebhookAddress, homeNetworkAllowed } from "./addresses.ts"
import { WEBHOOK_RETRY_DELAYS } from "./deliver.ts"
import { envelopeBody, messageId } from "./envelope.ts"
import { resumeWebhook } from "./pausing.ts"
import { recipeRef } from "./payloads.ts"
import { record, WEBHOOK_DELIVERY_JOB } from "./record.ts"
import { newWebhookSecret } from "./signing.ts"
import { configureWebhooks, linkBase } from "./state.ts"
import { forgetWebhooks } from "./wanted.ts"

let database: Database
let settings: Settings
let jobs: JobRunner
let close: () => Promise<void>
let home: string
let receiver: Receiver

const HOUR = 60 * 60_000
const DAY = 24 * HOUR

/** The next send, once a test asks to hold it under way. */
let heldSend: { reached: () => void; released: Promise<void> } | null = null

/**
 * Holds the next send before it leaves, until the test lets it go, so the
 * test can act while a try is under way.
 */
function holdNextSend() {
  let reached!: () => void
  let release!: () => void
  const isReached = new Promise<void>((resolve) => (reached = resolve))
  const released = new Promise<void>((resolve) => (release = resolve))
  heldSend = { reached, released }
  return { reached: isReached, release }
}

const publicFetcher = createPublicFetcher({ version: "test" })

const holdingFetcher: Fetcher = async (url, options) => {
  const held = heldSend
  heldSend = null
  if (held) {
    held.reached()
    await held.released
  }
  return publicFetcher(url, options)
}

beforeAll(async () => {
  const test = await createTestApp({ fetcher: holdingFetcher })
  ;({ database, settings, jobs, close } = test)
  await setUpServer(test.app, test.setupCode)
  home = (await database.em.fork().findOneOrFail(Household, { name: "Home" }))
    .id
  // The receiver is on this machine, so the home network is allowed, as a
  // server admin would for Home Assistant. It's saved rather than set from
  // the environment, which would lock it, so a test can turn it off again.
  await allowHomeNetwork("all")
  receiver = await startReceiver()
})

afterAll(async () => {
  await receiver.close()
  await close()
})

// Each test starts with no webhooks, nothing recorded or queued, and a
// receiver that answers 200.
beforeEach(async () => {
  const em = inHome()
  await em.nativeDelete(WebhookDelivery, {})
  await em.nativeDelete(WebhookEvent, {})
  await em.nativeDelete(Webhook, {})
  await em.nativeDelete(Job, { kind: WEBHOOK_DELIVERY_JOB })
  forgetWebhooks(home)
  receiver.requests.length = 0
  receiver.answer(200, "ok")
  heldSend = null
})

/** An entity manager that sees only Home's rows, as a route's does. */
const inHome = () => forHousehold(database.em, home)

function allowHomeNetwork(homeNetwork: "off" | "all" | "chosen") {
  return settings.saveServer(
    database.em.fork(),
    { "webhooks.homeNetwork": homeNetwork },
    null
  )
}

/**
 * A webhook straight in the database that wants everything, sending to the
 * receiver unless told otherwise. With `previousSecretUntil`, it was rotated
 * and still signs with the secret before.
 */
async function addWebhook(
  options: {
    address?: string
    previousSecretUntil?: Date
    headers?: { name: string; value: string }[]
  } = {}
) {
  const em = inHome()
  const address = options.address ?? `${receiver.url}/api/webhook/kitchen`
  const secret = newWebhookSecret()
  const previousSecret = newWebhookSecret()
  const webhook = em.create(Webhook, {
    household: home,
    name: "Home Assistant",
    host: new URL(address).host,
    address: em.create(Secret, settings.seal(address)),
    secret: em.create(Secret, settings.seal(secret)),
    previousSecret: options.previousSecretUntil
      ? em.create(Secret, settings.seal(previousSecret))
      : null,
    previousSecretUntil: options.previousSecretUntil ?? null,
    headers: options.headers
      ? em.create(Secret, settings.seal(JSON.stringify(options.headers)))
      : null,
    headerNames: (options.headers ?? []).map((header) => header.name),
    events: [],
    everything: true,
  })
  await em.flush()
  return {
    id: webhook.id,
    secret,
    previousSecret,
    previousSecretId: webhook.previousSecret?.id ?? null,
  }
}

/** Records a recipe being deleted, the simplest event to make. */
const recordAnyDeleted = (title = "Lemon Chicken") =>
  record(inHome(), home, {
    type: "recipe.deleted",
    data: {
      recipe: recipeRef({
        id: "0199e8b0-5a10-7a01-8b00-000000000006",
        slug: "lemon-chicken",
        name: title,
      }),
    },
  })

/** The same, for a webhook that wants it. */
async function recordDeleted(title?: string) {
  const event = await recordAnyDeleted(title)
  if (!event) throw new Error("No webhook wanted the event")
  return event
}

const deliveryOf = (event: WebhookEvent) =>
  inHome().findOneOrFail(WebhookDelivery, { event: event.id })

const webhookById = (id: string) => inHome().findOneOrFail(Webhook, { id })

/** A delivery's jobs, oldest first. */
async function jobsOf(delivery: WebhookDelivery) {
  const all = await database.em
    .fork()
    .find(
      Job,
      { kind: WEBHOOK_DELIVERY_JOB },
      { orderBy: { createdAt: "asc", id: "asc" } }
    )
  return all.filter((job) => job.payload.deliveryId === delivery.id)
}

/** Its latest job. */
async function jobOf(delivery: WebhookDelivery) {
  const job = (await jobsOf(delivery)).at(-1)
  if (!job) throw new Error("The delivery has no job")
  return job
}

/** A job as it is now. */
const load = (jobId: string) =>
  database.em.fork().findOneOrFail(Job, { id: jobId })

/** Moves a job waiting for its next try on to now, and runs it. */
async function tryAgainNow(job: Job) {
  await database.em
    .fork()
    .nativeUpdate(Job, { id: job.id }, { runAt: new Date() })
  await jobs.drain()
}

/** Checks a delivery as a receiver would, with the standardwebhooks package. */
function verify(secret: string, request: ReceivedRequest) {
  return new SignedWebhook(secret).verify(request.body, {
    "webhook-id": String(request.headers["webhook-id"]),
    "webhook-timestamp": String(request.headers["webhook-timestamp"]),
    "webhook-signature": String(request.headers["webhook-signature"]),
  })
}

const signatures = (request: ReceivedRequest) =>
  String(request.headers["webhook-signature"]).split(" ")

describe("delivering", () => {
  test("delivers a signed event", async () => {
    const { id, secret } = await addWebhook({
      headers: [{ name: "Authorization", value: "Bearer kitchen" }],
    })

    const event = await recordDeleted()
    await jobs.drain()

    expect(receiver.requests).toHaveLength(1)
    const [request] = receiver.requests as [ReceivedRequest]
    expect(request.method).toBe("POST")
    expect(request.headers["webhook-id"]).toBe(messageId(event))
    const timestamp = Number(request.headers["webhook-timestamp"])
    expect(Math.abs(timestamp - Date.now() / 1000)).toBeLessThan(5)
    expect(request.headers["user-agent"]).toMatch(/^Merran\//)
    expect(request.headers["content-type"]).toBe("application/json")
    expect(request.headers.authorization).toBe("Bearer kitchen")

    expect(() => verify(secret, request)).not.toThrow()
    // As saved: Postgres keeps JSON in its own order, and that's what's sent.
    const saved = await inHome().findOneOrFail(WebhookEvent, { id: event.id })
    expect(request.body.toString("utf8")).toBe(envelopeBody(saved))

    const delivery = await deliveryOf(event)
    expect(delivery).toMatchObject({
      state: "delivered",
      tries: 1,
      statusCode: 200,
      answer: "ok",
      error: null,
    })
    expect(delivery.deliveredAt).not.toBeNull()
    expect(delivery.lastTriedAt).not.toBeNull()
    expect(delivery.durationMs).toBeGreaterThanOrEqual(0)
    expect((await webhookById(id)).lastDeliveredAt).not.toBeNull()
  })

  test("a failure waits for the next try on Standard Webhooks' schedule", async () => {
    const { id } = await addWebhook()
    receiver.answer(500, "nope")

    const event = await recordDeleted()
    const before = Date.now()
    await jobs.drain()

    const delivery = await deliveryOf(event)
    expect(delivery).toMatchObject({
      state: "waiting",
      tries: 1,
      statusCode: 500,
      answer: "nope",
    })
    expect(delivery.error).toMatch(/500/)
    const webhook = await webhookById(id)
    expect(webhook.state).toBe("active")
    expect(webhook.failingSince).not.toBeNull()
    expect(webhook.lastError).toBe(delivery.error)

    const job = await jobOf(delivery)
    expect(job.status).toBe("queued")
    expect(job.runAt.getTime()).toBeGreaterThanOrEqual(before + 5_000)
    expect(job.runAt.getTime()).toBeLessThanOrEqual(Date.now() + 5_000)
  })

  test("the last try's failure pauses the webhook", async () => {
    const { id } = await addWebhook()
    receiver.answer(500, "nope")
    const event = await recordDeleted()
    // Another event waits its turn the whole time.
    const other = await deliveryOf(await recordDeleted())
    await database.em
      .fork()
      .nativeUpdate(
        Job,
        { id: (await jobOf(other)).id },
        { runAt: new Date(Date.now() + DAY) }
      )
    await jobs.drain()
    const delivery = await deliveryOf(event)

    // Tries 1 to 7 each wait their turn on the schedule.
    for (const [tried, wait] of WEBHOOK_RETRY_DELAYS.entries()) {
      expect(await deliveryOf(event)).toMatchObject({
        state: "waiting",
        tries: tried + 1,
      })
      const job = await jobOf(delivery)
      expect(job.runAt.getTime() - Date.now()).toBeGreaterThan(wait - 5_000)
      expect(job.runAt.getTime() - Date.now()).toBeLessThanOrEqual(wait)
      await tryAgainNow(job)
    }

    expect(await deliveryOf(event)).toMatchObject({
      state: "failed",
      tries: 8,
    })
    const webhook = await webhookById(id)
    expect(webhook).toMatchObject({ state: "paused", pausedReason: "gave_up" })
    expect(webhook.pausedAt).not.toBeNull()
    expect((await jobOf(delivery)).status).toBe("done")
    expect(
      (await inHome().findOneOrFail(WebhookDelivery, other.id)).state
    ).toBe("stopped")

    // The one that was waiting is never sent: its job is cancelled.
    expect((await jobOf(other)).status).toBe("cancelled")
    await tryAgainNow(await jobOf(other))
    expect(receiver.requests).toHaveLength(8)
  })

  test("a webhook's own headers can't replace Merran's", async () => {
    // Saving refuses these, but sending doesn't count on it.
    const { secret } = await addWebhook({
      headers: [
        { name: "User-Agent", value: "Someone else" },
        { name: "Webhook-Signature", value: "v1,forged" },
        { name: "Content-Type", value: "text/plain" },
        { name: "content-length", value: "1" },
        { name: "Accept", value: "application/json" },
        { name: "X-Kitchen", value: "on" },
      ],
    })

    await recordDeleted()
    await jobs.drain()

    const [request] = receiver.requests as [ReceivedRequest]
    expect(request.headers["user-agent"]).toMatch(/^Merran\//)
    expect(request.headers["content-type"]).toBe("application/json")
    expect(signatures(request)).toHaveLength(1)
    expect(request.headers["webhook-signature"]).not.toContain("forged")
    expect(() => verify(secret, request)).not.toThrow()
    // Its own replace the fetcher's defaults, rather than joining them.
    expect(request.headers.accept).toBe("application/json")
    expect(request.headers["x-kitchen"]).toBe("on")
  })

  test("saved parts that can't be opened fail the try like any other", async () => {
    const otherKey = await addWebhook()
    const brokenHeaders = await addWebhook()
    const noSecret = await addWebhook()
    const em = inHome()
    // Sealed with a key this server doesn't have, as after losing it.
    const sealedElsewhere = em.create(Secret, {
      keyId: "000000000000",
      dataKey: "sealed elsewhere",
      value: "sealed elsewhere",
    })
    // Headers that aren't the JSON they should be.
    const notJson = em.create(Secret, settings.seal("Bearer {kitchen-token"))
    await em.flush()
    await em.nativeUpdate(
      Webhook,
      { id: otherKey.id },
      { secret: sealedElsewhere.id }
    )
    await em.nativeUpdate(
      Webhook,
      { id: brokenHeaders.id },
      { headers: notJson.id }
    )
    await em.nativeUpdate(Webhook, { id: noSecret.id }, { secret: null })

    const event = await recordDeleted()
    await jobs.drain()

    expect(receiver.requests).toHaveLength(0)
    const deliveries = await inHome().find(
      WebhookDelivery,
      { event: event.id },
      { populate: ["webhook"] }
    )
    expect(deliveries).toHaveLength(3)
    const unreadable =
      "Merran couldn't open this webhook's saved address, secret or headers."
    for (const delivery of deliveries) {
      expect(delivery).toMatchObject({
        state: "waiting",
        tries: 1,
        statusCode: null,
        error: unreadable,
      })
      expect(delivery.webhook.getEntity()).toMatchObject({
        state: "active",
        lastError: unreadable,
      })
      expect(delivery.webhook.getEntity().failingSince).not.toBeNull()
      // It waits its turn, and nothing sealed shows on the Jobs page.
      const job = await jobOf(delivery)
      expect(job).toMatchObject({ status: "queued", error: unreadable })
    }
  })

  test("410 Gone pauses at once", async () => {
    const { id } = await addWebhook()
    receiver.answer(410, "Gone")

    const event = await recordDeleted()
    await jobs.drain()

    const webhook = await webhookById(id)
    expect(webhook).toMatchObject({ state: "paused", pausedReason: "gone" })
    const delivery = await deliveryOf(event)
    expect(delivery).toMatchObject({
      state: "failed",
      tries: 1,
      statusCode: 410,
    })
    expect((await jobOf(delivery)).status).toBe("done")
  })

  test("keeps only the first 1,024 characters of the answer", async () => {
    await addWebhook()
    receiver.answer(200, "x".repeat(5_000))

    const event = await recordDeleted()
    await jobs.drain()

    expect((await deliveryOf(event)).answer).toBe("x".repeat(1_024))
  })

  test("an answer with NUL characters is kept without them", async () => {
    // As a binary or UTF-16 answer has, which Postgres can't keep as text.
    await addWebhook()
    receiver.answer(200, "o\u0000k")

    const event = await recordDeleted()
    await jobs.drain()

    expect(await deliveryOf(event)).toMatchObject({
      state: "delivered",
      answer: "ok",
    })
  })

  test("an unreachable address is a failure, not a crash", async () => {
    // A port nothing listens on any more.
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const { port } = server.address() as AddressInfo
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await addWebhook({ address: `http://127.0.0.1:${port}/api/webhook/x` })

    const event = await recordDeleted()
    await jobs.drain()

    const delivery = await deliveryOf(event)
    expect(delivery).toMatchObject({
      state: "waiting",
      tries: 1,
      statusCode: null,
      answer: null,
      error: "Couldn't reach that site.",
    })
    expect((await jobOf(delivery)).status).toBe("queued")
  })

  test("the day after a rotation, both secrets sign", async () => {
    const rotated = await addWebhook({
      previousSecretUntil: new Date(Date.now() + DAY),
    })

    await recordDeleted()
    await jobs.drain()

    const [during] = receiver.requests as [ReceivedRequest]
    expect(signatures(during)).toHaveLength(2)
    expect(() => verify(rotated.secret, during)).not.toThrow()
    expect(() => verify(rotated.previousSecret, during)).not.toThrow()

    // A day on, only the new one signs.
    await inHome().nativeUpdate(
      Webhook,
      { id: rotated.id },
      { previousSecretUntil: new Date(Date.now() - 60_000) }
    )
    receiver.requests.length = 0
    await recordDeleted()
    await jobs.drain()

    const [after] = receiver.requests as [ReceivedRequest]
    expect(signatures(after)).toHaveLength(1)
    expect(() => verify(rotated.secret, after)).not.toThrow()
    expect(() => verify(rotated.previousSecret, after)).toThrow()
  })

  test("a title with accents and emoji is signed over the bytes sent", async () => {
    const { secret } = await addWebhook()

    await recordDeleted("Crème brûlée 🍮")
    await jobs.drain()

    const [request] = receiver.requests as [ReceivedRequest]
    expect(() => verify(secret, request)).not.toThrow()
    const sent = JSON.parse(request.body.toString("utf8")) as {
      data: { recipe: { title: string } }
    }
    expect(sent.data.recipe.title).toBe("Crème brûlée 🍮")
    // Every byte arrived: the length sent is the UTF-8 length, not the text's.
    expect(request.headers["content-length"]).toBe(String(request.body.length))
  })

  test("a webhook deleted while waiting ends its job quietly", async () => {
    const { id } = await addWebhook()
    receiver.answer(500, "nope")
    const event = await recordDeleted()
    await jobs.drain()
    const job = await jobOf(await deliveryOf(event))

    await inHome().nativeDelete(Webhook, { id })
    await tryAgainNow(job)

    const finished = await database.em.fork().findOneOrFail(Job, job.id)
    expect(finished.status).toBe("done")
    expect(receiver.requests).toHaveLength(1)
    expect(await inHome().count(WebhookDelivery, {})).toBe(0)
  })

  test("the home network can be turned off after saving", async () => {
    await addWebhook()
    receiver.answer(500, "nope")
    const event = await recordDeleted()
    await jobs.drain()

    await allowHomeNetwork("off")
    try {
      await tryAgainNow(await jobOf(await deliveryOf(event)))

      const delivery = await deliveryOf(event)
      expect(delivery).toMatchObject({
        state: "waiting",
        tries: 2,
        statusCode: null,
      })
      expect(delivery.error).toMatch(/private network/)
      expect(receiver.requests).toHaveLength(1)
    } finally {
      await allowHomeNetwork("all")
    }
  })

  test("nothing is sent while webhooks are off", async () => {
    await addWebhook()
    const event = await recordDeleted()
    const publicUrl = linkBase()

    configureWebhooks({ enabled: false, publicUrl })
    try {
      await jobs.drain()
    } finally {
      configureWebhooks({ enabled: true, publicUrl })
    }

    expect((await deliveryOf(event)).state).toBe("stopped")
    expect(receiver.requests).toHaveLength(0)
  })
})

describe("resuming", () => {
  test("starts sending again, and resends what failed in the last day", async () => {
    const { id } = await addWebhook()
    const lastTry = await recordDeleted()
    const stopped = await recordDeleted()
    const stale = await recordDeleted()
    const sentTest = await record(inHome(), home, {
      type: "webhook.test",
      data: { webhook: { id, name: "Home Assistant" } },
      only: id,
    })
    const ago = (ms: number) => new Date(Date.now() - ms)
    // A test is tried once, whatever comes of it.
    await inHome().nativeUpdate(
      WebhookDelivery,
      { event: sentTest!.id },
      { state: "failed", tries: 1, lastTriedAt: ago(60_000) }
    )
    // The one that ran out of tries began 27 hours ago, but failed just now.
    await inHome().nativeUpdate(
      WebhookDelivery,
      { event: lastTry.id },
      {
        state: "failed",
        tries: 8,
        createdAt: ago(27 * HOUR),
        lastTriedAt: ago(60_000),
      }
    )
    await inHome().nativeUpdate(
      WebhookDelivery,
      { event: stopped.id },
      { state: "stopped", createdAt: ago(HOUR) }
    )
    await inHome().nativeUpdate(
      WebhookDelivery,
      { event: stale.id },
      { state: "stopped", createdAt: ago(2 * DAY), lastTriedAt: ago(2 * DAY) }
    )
    await inHome().nativeUpdate(
      Webhook,
      { id },
      {
        state: "paused",
        pausedReason: "gave_up",
        pausedAt: ago(60_000),
        failingSince: ago(27 * HOUR),
        lastError: "That address answered with an error (500).",
      }
    )
    forgetWebhooks(home)
    expect(await recordAnyDeleted()).toBeNull()

    const em = inHome()
    const webhook = await em.findOneOrFail(Webhook, { id })
    expect(await resumeWebhook(em, webhook, { resend: true })).toBe(2)

    expect(await webhookById(id)).toMatchObject({
      state: "active",
      pausedReason: null,
      pausedAt: null,
      failingSince: null,
      lastError: null,
    })
    // Each one resent has one job, from its first try.
    for (const event of [lastTry, stopped]) {
      const itsJobs = await jobsOf(await deliveryOf(event))
      expect(itsJobs).toHaveLength(1)
      expect(itsJobs[0]).toMatchObject({ status: "queued", attempts: 0 })
    }
    await jobs.drain()
    expect((await deliveryOf(lastTry)).state).toBe("delivered")
    expect((await deliveryOf(stopped)).state).toBe("delivered")
    expect((await deliveryOf(stale)).state).toBe("stopped")
    expect((await deliveryOf(sentTest!)).state).toBe("failed")
    expect(receiver.requests).toHaveLength(2)
    // New events go to it again.
    expect(await recordAnyDeleted()).not.toBeNull()
  })

  test("starts each delivery over, once, so an old job can't send it again", async () => {
    const { id } = await addWebhook()
    receiver.answer(500, "nope")
    const first = await deliveryOf(await recordDeleted())
    const second = await deliveryOf(await recordDeleted())
    await jobs.drain()
    // Both have been failing for a day: each is down to its last try, and
    // the second's isn't due for hours.
    const db = database.em.fork()
    await db.nativeUpdate(
      Job,
      { id: (await jobOf(first)).id },
      { attempts: 7, runAt: new Date() }
    )
    await db.nativeUpdate(
      Job,
      { id: (await jobOf(second)).id },
      { attempts: 7, runAt: new Date(Date.now() + 10 * HOUR) }
    )

    // The first's last try is a 410: the webhook pauses, and the second
    // stops, with its job cancelled.
    receiver.answer(410, "Gone")
    await jobs.drain()
    expect(await webhookById(id)).toMatchObject({
      state: "paused",
      pausedReason: "gone",
    })
    expect((await jobOf(second)).status).toBe("cancelled")

    // A try under way as it paused would put its job back, due now.
    await db.nativeUpdate(
      Job,
      { id: (await jobOf(second)).id },
      { status: "queued", finishedAt: null, runAt: new Date() }
    )

    receiver.answer(500, "nope")
    receiver.requests.length = 0
    const em = inHome()
    const webhook = await em.findOneOrFail(Webhook, { id })
    expect(await resumeWebhook(em, webhook, { resend: true })).toBe(2)

    // Each has one job to run, from its first try.
    for (const delivery of [first, second]) {
      const toRun = (await jobsOf(delivery)).filter(
        (job) => job.status === "queued"
      )
      expect(toRun).toHaveLength(1)
      expect(toRun[0]).toMatchObject({ attempts: 0 })
    }
    await jobs.drain()

    // Sent once each, and one failure doesn't pause it again.
    expect(receiver.requests).toHaveLength(2)
    expect((await webhookById(id)).state).toBe("active")
    for (const delivery of [first, second]) {
      expect(
        await inHome().findOneOrFail(WebhookDelivery, delivery.id)
      ).toMatchObject({ state: "waiting", tries: 1 })
    }
  })

  test("a delivery resent while a try is under way is sent again straight after", async () => {
    const { id } = await addWebhook()
    receiver.answer(500, "nope")
    const underWay = await recordDeleted()
    const lastTry = await recordDeleted()
    const db = database.em.fork()
    const lastTryJob = await jobOf(await deliveryOf(lastTry))
    await db.nativeUpdate(
      Job,
      { id: lastTryJob.id },
      { runAt: new Date(Date.now() + DAY) }
    )

    // One delivery's try is under way...
    const send = holdNextSend()
    const draining = jobs.drain()
    await send.reached

    // ...when the other's last try fails, pausing the webhook...
    await db.nativeUpdate(
      Job,
      { id: lastTryJob.id },
      { attempts: 7, runAt: new Date() }
    )
    jobs.wake()
    await expect
      .poll(async () => (await load(lastTryJob.id)).status)
      .toBe("done")
    expect((await webhookById(id)).state).toBe("paused")

    // ...and someone resumes it, resending both.
    const em = inHome()
    const webhook = await em.findOneOrFail(Webhook, { id })
    expect(await resumeWebhook(em, webhook, { resend: true })).toBe(2)
    send.release()
    await draining

    // The try under way fails, but its delivery was resent meanwhile, so
    // it's tried again now, not at that try's next turn.
    const sendsOf = (event: WebhookEvent) =>
      receiver.requests.filter(
        (request) => request.headers["webhook-id"] === messageId(event)
      )
    expect(sendsOf(underWay)).toHaveLength(2)
    expect(sendsOf(lastTry)).toHaveLength(2)
    expect((await webhookById(id)).state).toBe("active")
  })
})

describe("addresses", () => {
  test("must be http or https, without a password, and not too long", async () => {
    const fullAddress = "Use a full address, starting with http:// or https://."
    for (const address of ["ftp://example.com/h", "not an address"]) {
      await expect(
        checkWebhookAddress(address, { homeNetwork: true })
      ).rejects.toMatchObject({
        code: "webhook_address",
        message: fullAddress,
        fields: { address: fullAddress },
      })
    }
    await expect(
      checkWebhookAddress("https://user:pw@93.184.215.14/h", {
        homeNetwork: false,
      })
    ).rejects.toMatchObject({
      code: "webhook_address",
      message: "Put a user name or password in a header, not the address.",
    })
    await expect(
      checkWebhookAddress(`https://example.com/${"a".repeat(2_000)}`, {
        homeNetwork: true,
      })
    ).rejects.toMatchObject({ code: "webhook_address" })

    const address = await checkWebhookAddress("http://93.184.215.14/h", {
      homeNetwork: false,
    })
    expect(address.href).toBe("http://93.184.215.14/h")
  })

  test("go to the home network only when the server admin allows it", async () => {
    const homeNetwork =
      "This address is on your home network. The server admin can allow that in Settings → Server → Webhooks."
    for (const address of [
      "http://192.168.1.20:8123/api/webhook/kitchen",
      "http://localhost:8123/api/webhook/kitchen",
    ]) {
      await expect(
        checkWebhookAddress(address, { homeNetwork: false })
      ).rejects.toMatchObject({
        code: "webhook_home_network",
        message: homeNetwork,
        fields: { address: homeNetwork },
      })
    }

    const allowed = await checkWebhookAddress(
      "http://192.168.1.20:8123/api/webhook/kitchen",
      { homeNetwork: true }
    )
    expect(allowed.host).toBe("192.168.1.20:8123")
  })

  test("the home network is allowed for every household, or chosen ones", async () => {
    expect(await homeNetworkAllowed(settings, home)).toBe(true)
    try {
      await allowHomeNetwork("chosen")
      expect(await homeNetworkAllowed(settings, home)).toBe(false)
      await settings.saveServer(
        database.em.fork(),
        { "webhooks.homeNetworkHouseholds": [home] },
        null
      )
      expect(await homeNetworkAllowed(settings, home)).toBe(true)
      await allowHomeNetwork("off")
      expect(await homeNetworkAllowed(settings, home)).toBe(false)
    } finally {
      await settings.saveServer(
        database.em.fork(),
        {
          "webhooks.homeNetwork": "all",
          "webhooks.homeNetworkHouseholds": null,
        },
        null
      )
    }
  })
})

describe("clearing out", () => {
  test("old events are cleared after 30 days", async () => {
    const rotated = await addWebhook({
      previousSecretUntil: new Date(Date.now() - 60_000),
    })
    const old = await recordDeleted()
    const recent = await recordDeleted()
    await inHome().nativeDelete(Job, { kind: WEBHOOK_DELIVERY_JOB })
    await inHome().nativeUpdate(
      WebhookEvent,
      { id: old.id },
      { createdAt: new Date(Date.now() - 31 * DAY) }
    )
    await inHome().nativeUpdate(
      WebhookEvent,
      { id: recent.id },
      { createdAt: new Date(Date.now() - 29 * DAY) }
    )

    await enqueue(database.em.fork(), { kind: "jobs.cleanUp" })
    await jobs.drain()

    const events = await inHome().find(WebhookEvent, {})
    expect(events.map((event) => event.id)).toEqual([recent.id])
    const deliveries = await inHome().find(WebhookDelivery, {})
    expect(deliveries.map((delivery) => delivery.event.id)).toEqual([recent.id])
    // And the secret before a rotation, a day on.
    const webhook = await webhookById(rotated.id)
    expect(webhook.previousSecret).toBeNull()
    expect(webhook.previousSecretUntil).toBeNull()
    expect(
      await database.em.fork().count(Secret, { id: rotated.previousSecretId! })
    ).toBe(0)
  })
})

describe("the paused email", () => {
  test("the paused email says why and where to resume", () => {
    const email = webhookPausedEmail({
      household: "Home",
      webhook: "Home Assistant",
      reason: "gave_up",
      link: null,
    })

    expect(email.subject).toBe("Home Assistant is paused")
    expect(email.text).toContain("for about a day")
    expect(email.text).toContain("Settings → Household → Webhooks")

    const gone = webhookPausedEmail({
      household: "Home",
      webhook: "<n8n>",
      reason: "gone",
      link: "https://merran.example.com/settings/household#webhooks",
    })
    expect(gone.text).toContain("answered that it's gone")
    expect(gone.text).toContain(
      "https://merran.example.com/settings/household#webhooks"
    )
    expect(gone.html).toContain("&lt;n8n&gt;")
    expect(gone.html).not.toContain("<n8n>")
  })
})
