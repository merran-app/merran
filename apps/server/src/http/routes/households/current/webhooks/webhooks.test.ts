import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import {
  Job,
  Secret,
  Webhook,
  WebhookDelivery,
  WebhookEvent,
} from "../../../../../database/entities/index.ts"
import type { Database } from "../../../../../database/orm.ts"
import { forHousehold } from "../../../../../database/scope.ts"
import { createPublicFetcher } from "../../../../../services/fetch/public-fetch.ts"
import type { JobRunner } from "../../../../../services/jobs/runner.ts"
import type { Settings } from "../../../../../services/settings/settings.ts"
import {
  recipeRef,
  webhookEnvelopeSchema,
} from "../../../../../services/webhooks/payloads.ts"
import {
  record,
  WEBHOOK_DELIVERY_JOB,
} from "../../../../../services/webhooks/record.ts"
import { configureWebhooks } from "../../../../../services/webhooks/state.ts"
import { forgetWebhooks } from "../../../../../services/webhooks/wanted.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TEST_ORIGIN,
  type TestClient,
} from "../../../../../test/app.ts"
import {
  startReceiver,
  type Receiver,
} from "../../../../../test/webhook-receiver.ts"

let app: App
let database: Database
let settings: Settings
let jobs: JobRunner
let close: () => Promise<void>
let kyle: TestClient
let sam: TestClient
let home: string
let receiver: Receiver

const WEBHOOKS = "/api/households/current/webhooks"
const PUBLIC_URL = "http://merran.test"
const HOUR = 60 * 60_000
const DAY = 24 * HOUR

const HOME_NETWORK_MESSAGE =
  "This address is on your home network. The server admin can allow that in Settings → Server → Webhooks."

beforeAll(async () => {
  const test = await createTestApp({
    fetcher: createPublicFetcher({ version: "test" }),
    publicUrl: PUBLIC_URL,
  })
  ;({ app, database, settings, jobs, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  sam = await join(app, await inviteToken(kyle), account("sam", "Sam"))
  home = (await (await kyle.get("/api/households/current")).json()).id
  receiver = await startReceiver()
  // The receiver is on this machine, so the home network is allowed, as a
  // server admin would for Home Assistant.
  await saveServerSettings({ "webhooks.homeNetwork": "all" })
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
})

/** An entity manager that sees only Home's rows, as a route's does. */
const inHome = () => forHousehold(database.em, home)

async function saveServerSettings(changes: Record<string, unknown>) {
  const res = await kyle.patch("/api/settings/server", changes)
  expect(res.status).toBe(200)
}

const hookAddress = (path = "/api/webhook/merran") => `${receiver.url}${path}`

/** What the Add webhook form sends, with any changes. */
function newWebhook(changes: Record<string, unknown> = {}) {
  return {
    name: "Home Assistant",
    address: hookAddress(),
    events: ["recipe.created"],
    everything: false,
    headers: [],
    ...changes,
  }
}

/** Adds a webhook as Kyle, through the API. */
async function addWebhook(changes: Record<string, unknown> = {}) {
  const res = await kyle.post(WEBHOOKS, newWebhook(changes))
  expect(res.status).toBe(201)
  return (await res.json()) as { webhook: { id: string }; secret: string }
}

/** A webhook's row, read fresh. */
const webhookRow = (id: string) =>
  inHome().findOneOrFail(Webhook, { id }, { populate: ["previousSecret"] })

/** Records a recipe being deleted, as Home's recipes would. */
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

/** The jobs still to send a delivery. */
const activeJobsOf = (deliveryId: string) =>
  database.em.fork().find(Job, {
    key: `${WEBHOOK_DELIVERY_JOB}:${deliveryId}`,
    status: { $in: ["queued", "running"] },
  })

/** What an error answer says. */
async function errorOf(res: { status: number; json(): Promise<unknown> }) {
  return ((await res.json()) as { error: Record<string, unknown> }).error
}

describe("adding a webhook", () => {
  test("an admin adds a webhook and sees its secret once", async () => {
    const res = await kyle.post(WEBHOOKS, newWebhook())

    expect(res.status).toBe(201)
    const made = await res.json()
    expect(made.secret).toMatch(/^whsec_/)
    expect(made.webhook).toMatchObject({
      name: "Home Assistant",
      host: `127.0.0.1:${receiver.port}`,
      events: ["recipe.created"],
      everything: false,
      headers: [],
      state: "working",
      pausedReason: null,
      lastDeliveredAt: null,
    })

    const list = await (await kyle.get(WEBHOOKS)).json()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: made.webhook.id, state: "working" })
    expect(list[0]).not.toHaveProperty("address")
    expect(list[0]).not.toHaveProperty("secret")

    const one = await (await kyle.get(`${WEBHOOKS}/${made.webhook.id}`)).json()
    expect(one).toMatchObject({
      id: made.webhook.id,
      address: hookAddress(),
    })
    expect(one).not.toHaveProperty("secret")
  })

  test("a home-network address is refused unless the server admin allows it", async () => {
    const { webhook } = await addWebhook()
    await saveServerSettings({ "webhooks.homeNetwork": "off" })
    try {
      const added = await kyle.post(WEBHOOKS, newWebhook())
      expect(added.status).toBe(400)
      expect(await errorOf(added)).toEqual({
        code: "webhook_home_network",
        message: HOME_NETWORK_MESSAGE,
        fields: { address: HOME_NETWORK_MESSAGE },
      })

      const moved = await kyle.patch(`${WEBHOOKS}/${webhook.id}`, {
        name: "Moved",
        address: hookAddress("/api/webhook/elsewhere"),
      })
      expect(moved.status).toBe(400)
      expect(await errorOf(moved)).toMatchObject({
        code: "webhook_home_network",
        fields: { address: HOME_NETWORK_MESSAGE },
      })
      // Nothing was saved.
      const kept = await (await kyle.get(`${WEBHOOKS}/${webhook.id}`)).json()
      expect(kept).toMatchObject({
        name: "Home Assistant",
        address: hookAddress(),
      })

      await saveServerSettings({
        "webhooks.homeNetwork": "chosen",
        "webhooks.homeNetworkHouseholds": [home],
      })
      expect((await kyle.post(WEBHOOKS, newWebhook())).status).toBe(201)
    } finally {
      await saveServerSettings({
        "webhooks.homeNetwork": "all",
        "webhooks.homeNetworkHouseholds": [],
      })
    }
  })

  test("addresses must be http or https, without a password", async () => {
    for (const address of [
      "ftp://example.com/h",
      "https://user:pw@93.184.215.14/h",
    ]) {
      const res = await kyle.post(WEBHOOKS, newWebhook({ address }))
      expect(res.status, address).toBe(400)
      const error = await errorOf(res)
      expect(error, address).toMatchObject({ code: "webhook_address" })
      expect(error.fields, address).toEqual({ address: error.message })
    }
  })

  test("events must be known, and at least one unless everything", async () => {
    const unknown = await kyle.post(
      WEBHOOKS,
      newWebhook({ events: ["recipe.nope"] })
    )
    expect(unknown.status).toBe(400)

    const none = await kyle.post(WEBHOOKS, newWebhook({ events: [] }))
    expect(none.status).toBe(400)
    expect(await errorOf(none)).toEqual({
      code: "webhook_events",
      message: "Pick at least one event.",
      fields: { events: "Pick at least one event." },
    })

    const everything = await kyle.post(
      WEBHOOKS,
      newWebhook({ events: [], everything: true })
    )
    expect(everything.status).toBe(201)
    expect((await everything.json()).webhook).toMatchObject({
      events: [],
      everything: true,
    })
  })

  test("headers are limited and can't replace Merran's own", async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      name: `X-Extra-${i}`,
      value: "x",
    }))
    expect(
      (await kyle.post(WEBHOOKS, newWebhook({ headers: six }))).status
    ).toBe(400)

    for (const name of ["Content-Type", "webhook-id"]) {
      const res = await kyle.post(
        WEBHOOKS,
        newWebhook({ headers: [{ name, value: "x" }] })
      )
      expect(res.status, name).toBe(400)
      expect(await errorOf(res), name).toEqual({
        code: "webhook_headers",
        message: "That header is one Merran sets itself.",
        fields: { headers: "That header is one Merran sets itself." },
      })
    }

    const { webhook } = await addWebhook({
      headers: [{ name: "Authorization", value: "Bearer x" }],
    })
    const one = await (await kyle.get(`${WEBHOOKS}/${webhook.id}`)).json()
    expect(one.headers).toEqual(["Authorization"])

    await kyle.post(`${WEBHOOKS}/${webhook.id}/test`)
    expect(receiver.requests).toHaveLength(1)
    expect(receiver.requests[0]!.headers.authorization).toBe("Bearer x")
  })

  test("a household can have up to 10", async () => {
    for (let i = 0; i < 10; i++) {
      await addWebhook({ name: `Webhook ${i + 1}` })
    }

    const eleventh = await kyle.post(WEBHOOKS, newWebhook())
    expect(eleventh.status).toBe(409)
    expect(await errorOf(eleventh)).toEqual({
      code: "too_many_webhooks",
      message: "A household can have up to 10 webhooks.",
    })
  })
})

describe("who can manage them", () => {
  /** A request sent with an API key, with the body as JSON. */
  function withKey(key: string, method: string, path: string, body?: unknown) {
    return app.request(`${TEST_ORIGIN}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }

  /** A key that may do everything a key can. */
  async function keyWithEveryPermission() {
    const res = await kyle.post("/api/auth/api-keys", {
      name: "Everything",
      permissions: {
        household: "read",
        recipes: "write",
        plan: "write",
        list: "write",
        pantry: "write",
        imports: "write",
        assistant: "write",
      },
      expiresInDays: 30,
    })
    expect(res.status).toBe(201)
    return (await res.json()).key as string
  }

  type Call = [method: string, path: string, body: unknown]

  /** Every webhook route: the household's, and those for one webhook. */
  function everyRoute(
    webhookId: string,
    deliveryId: string
  ): { forTheHousehold: Call[]; forOne: Call[] } {
    const one = `${WEBHOOKS}/${webhookId}`
    return {
      forTheHousehold: [
        ["GET", WEBHOOKS, undefined],
        ["POST", WEBHOOKS, newWebhook()],
      ],
      forOne: [
        ["GET", one, undefined],
        ["PATCH", one, { name: "Renamed" }],
        ["DELETE", one, undefined],
        ["POST", `${one}/test`, {}],
        ["GET", `${one}/secret`, undefined],
        ["POST", `${one}/secret/rotate`, {}],
        ["GET", `${one}/deliveries`, undefined],
        ["POST", `${one}/deliveries/${deliveryId}/resend`, {}],
      ],
    }
  }

  test("members, API keys and other households can't touch them", async () => {
    const { webhook, secret } = await addWebhook({ everything: true })
    const delivery = await deliveryOf(await recordDeleted())
    const routes = everyRoute(webhook.id, delivery.id)
    const all = [...routes.forTheHousehold, ...routes.forOne]
    const key = await keyWithEveryPermission()

    for (const [method, path, body] of all) {
      const bySam = await sam.request(method, path, body)
      expect(bySam.status, `${method} ${path} by Sam`).toBe(403)
      expect((await errorOf(bySam)).code).toBe("not_household_admin")

      const byKey = await withKey(key, method, path, body)
      expect(byKey.status, `${method} ${path} by a key`).toBe(403)
      expect((await errorOf(byKey)).code).toBe("api_key_not_allowed")
    }

    // Making a household switches the server admin to it.
    await kyle.post("/api/households", { name: "Cabin" })
    try {
      for (const [method, path, body] of routes.forOne) {
        const fromCabin = await kyle.request(method, path, body)
        expect(fromCabin.status, `${method} ${path} from Cabin`).toBe(404)
        expect((await errorOf(fromCabin)).code).toBe("webhook_not_found")
      }
      expect(await (await kyle.get(WEBHOOKS)).json()).toEqual([])
    } finally {
      await kyle.post("/api/auth/organization/set-active", {
        organizationId: home,
      })
    }

    // Nothing changed.
    const row = await webhookRow(webhook.id)
    expect(row).toMatchObject({ name: "Home Assistant", state: "active" })
    const shown = await (
      await kyle.get(`${WEBHOOKS}/${webhook.id}/secret`)
    ).json()
    expect(shown.secret).toBe(secret)
    expect(receiver.requests).toHaveLength(0)
  })

  test("the routes are refused while webhooks are off", async () => {
    configureWebhooks({ enabled: false, publicUrl: null })
    try {
      const res = await kyle.get(WEBHOOKS)
      expect(res.status).toBe(403)
      expect(await errorOf(res)).toEqual({
        code: "webhooks_off",
        message: "Webhooks are turned off on this server.",
      })
    } finally {
      configureWebhooks({ enabled: true, publicUrl: PUBLIC_URL })
    }
  })
})

describe("a webhook", () => {
  test("can be changed", async () => {
    const { webhook } = await addWebhook()

    const res = await kyle.patch(`${WEBHOOKS}/${webhook.id}`, {
      name: "n8n",
      address: hookAddress("/webhook/kitchen"),
      events: [],
      everything: true,
      headers: [{ name: "X-Token", value: "secret" }],
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      name: "n8n",
      events: [],
      everything: true,
      headers: ["X-Token"],
    })
    const one = await (await kyle.get(`${WEBHOOKS}/${webhook.id}`)).json()
    expect(one.address).toBe(hookAddress("/webhook/kitchen"))

    const nothing = await kyle.patch(`${WEBHOOKS}/${webhook.id}`, {
      everything: false,
    })
    expect(nothing.status).toBe(400)
    expect((await errorOf(nothing)).code).toBe("webhook_events")

    const cleared = await kyle.patch(`${WEBHOOKS}/${webhook.id}`, {
      headers: [],
    })
    expect((await cleared.json()).headers).toEqual([])
    await kyle.post(`${WEBHOOKS}/${webhook.id}/test`)
    expect(receiver.requests.at(-1)!.headers["x-token"]).toBe(undefined)
  })

  test("Send a test delivers once and shows the answer", async () => {
    const { webhook } = await addWebhook()

    const delivered = await kyle.post(`${WEBHOOKS}/${webhook.id}/test`)
    expect(delivered.status).toBe(200)
    const sent = await delivered.json()
    expect(sent).toMatchObject({
      state: "delivered",
      statusCode: 200,
      tries: 1,
      answer: "ok",
      event: { type: "webhook.test" },
    })
    expect(sent.event.id).toMatch(/^msg_/)
    expect(JSON.parse(sent.body).data.webhook).toEqual({
      id: webhook.id,
      name: "Home Assistant",
    })
    expect(receiver.requests).toHaveLength(1)

    receiver.answer(500, "nope")
    const failed = await kyle.post(`${WEBHOOKS}/${webhook.id}/test`)
    expect(await failed.json()).toMatchObject({
      state: "failed",
      statusCode: 500,
      answer: "nope",
    })
    const after = await (await kyle.get(`${WEBHOOKS}/${webhook.id}`)).json()
    expect(after).toMatchObject({ state: "working", failingSince: null })
    expect(
      await database.em.fork().count(Job, { kind: WEBHOOK_DELIVERY_JOB })
    ).toBe(0)

    await kyle.patch(`${WEBHOOKS}/${webhook.id}`, { paused: true })
    receiver.answer(200, "ok")
    const toPaused = await kyle.post(`${WEBHOOKS}/${webhook.id}/test`)
    expect(await toPaused.json()).toMatchObject({ state: "delivered" })
    expect(receiver.requests).toHaveLength(3)
  })

  test("pausing, resuming and resending", async () => {
    const { webhook } = await addWebhook({ everything: true })
    const event = await recordDeleted()

    const paused = await kyle.patch(`${WEBHOOKS}/${webhook.id}`, {
      paused: true,
    })
    expect(paused.status).toBe(200)
    expect(await paused.json()).toMatchObject({
      state: "paused",
      pausedReason: "by_hand",
    })
    expect(await recordAnyDeleted()).toBe(null)

    const stopped = await deliveryOf(event)
    expect(stopped.state).toBe("stopped")
    await inHome().nativeUpdate(
      WebhookDelivery,
      { id: stopped.id },
      { createdAt: new Date(Date.now() - HOUR) }
    )

    const resumed = await kyle.patch(`${WEBHOOKS}/${webhook.id}`, {
      paused: false,
      resend: true,
    })
    expect(await resumed.json()).toMatchObject({
      state: "working",
      pausedReason: null,
      pausedAt: null,
    })
    expect(await deliveryOf(event)).toMatchObject({
      state: "waiting",
      tries: 0,
    })
    expect(await activeJobsOf(stopped.id)).toHaveLength(1)
  })

  test("rotating keeps the old secret signing for a day", async () => {
    const { webhook, secret } = await addWebhook()

    const rotated = await kyle.post(`${WEBHOOKS}/${webhook.id}/secret/rotate`)
    expect(rotated.status).toBe(200)
    const { secret: newSecret } = await rotated.json()
    expect(newSecret).toMatch(/^whsec_/)
    expect(newSecret).not.toBe(secret)

    const shown = await (
      await kyle.get(`${WEBHOOKS}/${webhook.id}/secret`)
    ).json()
    expect(shown).toEqual({ secret: newSecret })

    const row = await webhookRow(webhook.id)
    expect(settings.open(row.previousSecret!.getEntity())).toBe(secret)
    const until = row.previousSecretUntil!.getTime()
    expect(Math.abs(until - (Date.now() + DAY))).toBeLessThan(60_000)

    // Deliveries carry both signatures meanwhile.
    await kyle.post(`${WEBHOOKS}/${webhook.id}/test`)
    const signature = String(receiver.requests[0]!.headers["webhook-signature"])
    expect(signature.split(" ")).toHaveLength(2)

    // Rotating again lets the first secret go.
    const firstSecretRow = row.previousSecret!.id
    await kyle.post(`${WEBHOOKS}/${webhook.id}/secret/rotate`)
    expect(await database.em.fork().count(Secret, { id: firstSecretRow })).toBe(
      0
    )
  })
})

describe("deliveries", () => {
  test("the deliveries log pages newest first", async () => {
    const { webhook } = await addWebhook({ everything: true })
    const titles = ["First", "Second", "Third"]
    for (const [i, title] of titles.entries()) {
      const event = await recordDeleted(title)
      await inHome().nativeUpdate(
        WebhookDelivery,
        { event: event.id },
        { createdAt: new Date(Date.now() - (titles.length - i) * HOUR) }
      )
    }
    const log = `${WEBHOOKS}/${webhook.id}/deliveries`

    const first = await kyle.get(`${log}?limit=2`)
    expect(first.status).toBe(200)
    const page = await first.json()
    expect(page.total).toBe(3)
    const rest = await (await kyle.get(`${log}?offset=2`)).json()
    expect(rest.total).toBe(3)

    const shown = [...page.deliveries, ...rest.deliveries]
    expect(
      shown.map((delivery) => JSON.parse(delivery.body).data.recipe.title)
    ).toEqual(["Third", "Second", "First"])
    for (const delivery of shown) {
      expect(delivery).toMatchObject({
        state: "waiting",
        tries: 0,
        event: { type: "recipe.deleted" },
      })
      const parsed = webhookEnvelopeSchema("recipe.deleted").safeParse(
        JSON.parse(delivery.body)
      )
      expect(parsed.error?.issues).toBe(undefined)
    }
  })

  test("a delivery can be resent", async () => {
    const { webhook } = await addWebhook({ everything: true })
    const delivery = await deliveryOf(await recordDeleted())
    const resend = `${WEBHOOKS}/${webhook.id}/deliveries/${delivery.id}/resend`

    const waiting = await kyle.post(resend)
    expect(waiting.status).toBe(409)
    expect(await errorOf(waiting)).toEqual({
      code: "delivery_waiting",
      message: "That delivery is still being tried.",
    })

    // It ran out of tries.
    await inHome().nativeUpdate(
      WebhookDelivery,
      { id: delivery.id },
      { state: "failed", tries: 8 }
    )
    await database.em
      .fork()
      .nativeUpdate(Job, { kind: WEBHOOK_DELIVERY_JOB }, { status: "failed" })

    const resent = await kyle.post(resend)
    expect(resent.status).toBe(200)
    expect(await resent.json()).toMatchObject({
      id: delivery.id,
      state: "waiting",
      tries: 0,
    })
    expect(await activeJobsOf(delivery.id)).toHaveLength(1)

    await kyle.patch(`${WEBHOOKS}/${webhook.id}`, { paused: true })
    const toPaused = await kyle.post(resend)
    expect(toPaused.status).toBe(409)
    expect(await errorOf(toPaused)).toEqual({
      code: "webhook_paused",
      message: "Resume the webhook first.",
    })

    const unknown = await kyle.post(
      `${WEBHOOKS}/${webhook.id}/deliveries/0199e8b0-5a10-7a01-8b00-000000000099/resend`
    )
    expect(unknown.status).toBe(404)
    expect((await errorOf(unknown)).code).toBe("delivery_not_found")
  })

  test("a test resent is still a test: tried once, and it never pauses", async () => {
    const { webhook } = await addWebhook()
    receiver.answer(500, "nope")
    const tested = await (
      await kyle.post(`${WEBHOOKS}/${webhook.id}/test`)
    ).json()

    const resent = await kyle.post(
      `${WEBHOOKS}/${webhook.id}/deliveries/${tested.id}/resend`
    )
    expect(resent.status).toBe(200)
    await jobs.drain()

    const delivery = await inHome().findOneOrFail(WebhookDelivery, {
      id: tested.id,
    })
    expect(delivery).toMatchObject({ state: "failed", tries: 1 })
    expect(await activeJobsOf(tested.id)).toHaveLength(0)
    const after = await (await kyle.get(`${WEBHOOKS}/${webhook.id}`)).json()
    expect(after).toMatchObject({ state: "working", failingSince: null })
  })

  test("deleting removes it and its secrets", async () => {
    const { webhook } = await addWebhook({
      everything: true,
      headers: [{ name: "Authorization", value: "Bearer x" }],
    })
    await kyle.post(`${WEBHOOKS}/${webhook.id}/secret/rotate`)
    const row = await webhookRow(webhook.id)
    const secretIds = [
      row.address?.id,
      row.secret?.id,
      row.previousSecret?.id,
      row.headers?.id,
    ]
    expect(secretIds.every(Boolean)).toBe(true)
    const delivery = await deliveryOf(await recordDeleted())

    const res = await kyle.delete(`${WEBHOOKS}/${webhook.id}`)
    expect(res.status).toBe(204)

    expect(
      await database.em
        .fork()
        .count(Secret, { id: { $in: secretIds as string[] } })
    ).toBe(0)
    const gone = await kyle.get(`${WEBHOOKS}/${webhook.id}`)
    expect(gone.status).toBe(404)
    expect((await errorOf(gone)).code).toBe("webhook_not_found")
    // Its waiting delivery won't be tried, and nothing new is recorded for it.
    expect(await activeJobsOf(delivery.id)).toHaveLength(0)
    expect(await recordAnyDeleted()).toBe(null)
  })
})
