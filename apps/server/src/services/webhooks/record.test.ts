import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"
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
import { inHouseholdTransaction } from "../../database/transactions.ts"
import { createTestApp, setUpServer } from "../../test/app.ts"
import type { Settings } from "../settings/settings.ts"
import { actorOf, MERRAN, withActor, type Actor } from "./actor.ts"
import { envelopeBody } from "./envelope.ts"
import { recipeRef, webhookEnvelopeSchema } from "./payloads.ts"
import { record, WEBHOOK_DELIVERY_JOB, wantsEvent } from "./record.ts"
import { newWebhookSecret } from "./signing.ts"
import { configureWebhooks, linkBase } from "./state.ts"
import { forgetWebhooks } from "./wanted.ts"

let database: Database
let settings: Settings
let close: () => Promise<void>
let home: string

beforeAll(async () => {
  const test = await createTestApp()
  ;({ database, settings, close } = test)
  await setUpServer(test.app, test.setupCode)
  home = (await database.em.fork().findOneOrFail(Household, { name: "Home" }))
    .id
})

afterAll(() => close())

// Each test starts with no webhooks, and nothing recorded or queued.
beforeEach(async () => {
  const em = inHome()
  await em.nativeDelete(WebhookDelivery, {})
  await em.nativeDelete(WebhookEvent, {})
  await em.nativeDelete(Webhook, {})
  await em.nativeDelete(Job, { kind: WEBHOOK_DELIVERY_JOB })
  forgetWebhooks(home)
})

/** An entity manager that sees only Home's rows, as a route's does. */
const inHome = () => forHousehold(database.em, home)

/** A webhook straight in the database, wanting nothing unless told. */
async function addWebhook(
  options: {
    events?: string[]
    everything?: boolean
    state?: "active" | "paused"
  } = {}
) {
  const em = inHome()
  const webhook = em.create(Webhook, {
    household: home,
    name: "Home Assistant",
    host: "127.0.0.1",
    address: em.create(
      Secret,
      settings.seal("http://127.0.0.1:8123/api/webhook/kitchen")
    ),
    secret: em.create(Secret, settings.seal(newWebhookSecret())),
    headerNames: [],
    events: options.events ?? [],
    everything: options.everything ?? false,
    state: options.state ?? "active",
  })
  await em.flush()
  return webhook.id
}

const lemonChicken = () =>
  recipeRef({
    id: "0199e8b0-5a10-7a01-8b00-000000000006",
    slug: "lemon-chicken",
    name: "Lemon Chicken",
  })

/** Records a recipe being deleted, the simplest event to make. */
const recordDeleted = () =>
  record(inHome(), home, {
    type: "recipe.deleted",
    data: { recipe: lemonChicken() },
  })

const deliveryJobs = () =>
  database.em.fork().find(Job, { kind: WEBHOOK_DELIVERY_JOB })

describe("record", () => {
  test("records nothing when no webhook wants the event", async () => {
    await addWebhook({ events: ["recipe.created"] })

    expect(await recordDeleted()).toBeNull()

    expect(await inHome().count(WebhookEvent, {})).toBe(0)
    expect(await inHome().count(WebhookDelivery, {})).toBe(0)
    expect(await deliveryJobs()).toHaveLength(0)
  })

  test("records the event, a delivery and a job for each webhook that wants it", async () => {
    const wantsIt = await addWebhook({ events: ["recipe.created"] })
    const wantsEverything = await addWebhook({ everything: true })
    await addWebhook({ events: ["recipe.deleted"] })
    await addWebhook({ events: ["recipe.created"], state: "paused" })

    const event = await record(inHome(), home, {
      type: "recipe.created",
      data: {
        recipe: lemonChicken(),
        origin: "link",
        sourceUrl: "https://example.com/lemon-chicken",
      },
    })

    expect(event).not.toBeNull()
    const deliveries = await inHome().find(WebhookDelivery, {})
    expect(deliveries.map((delivery) => delivery.webhook.id).sort()).toEqual(
      [wantsIt, wantsEverything].sort()
    )
    expect(deliveries.map((delivery) => delivery.event.id)).toEqual([
      event!.id,
      event!.id,
    ])

    const jobs = await deliveryJobs()
    expect(jobs).toHaveLength(2)
    expect(jobs.map((job) => job.payload)).toEqual(
      expect.arrayContaining(
        deliveries.map((delivery) => ({ deliveryId: delivery.id }))
      )
    )
    for (const job of jobs) {
      expect(job.maxAttempts).toBe(8)
      expect(job.forHousehold?.id).toBe(home)
      // One job a delivery, so pausing and resending can find it.
      expect(job.key).toBe(`webhooks.deliver:${String(job.payload.deliveryId)}`)
    }

    const envelope = webhookEnvelopeSchema("recipe.created").parse(
      JSON.parse(envelopeBody(event!))
    )
    expect(envelope.data.household).toEqual({ id: home, name: "Home" })
    expect(envelope.data.recipe.url).toBe(
      "http://merran.test/recipes/lemon-chicken"
    )
  })

  test("saves the event, its deliveries and their jobs together", async () => {
    await addWebhook({ everything: true })
    await addWebhook({ everything: true })
    const em = inHome()
    const flush = vi.spyOn(em, "flush")

    await record(em, home, {
      type: "recipe.deleted",
      data: { recipe: lemonChicken() },
    })

    // One save, so a crash between two can't leave a delivery with no job
    // to send it.
    expect(flush).toHaveBeenCalledTimes(1)
    expect(await inHome().count(WebhookDelivery, {})).toBe(2)
    expect(await deliveryJobs()).toHaveLength(2)
  })

  test("a change that rolls back records nothing", async () => {
    await addWebhook({ everything: true })

    await expect(
      inHouseholdTransaction(database.em.fork(), home, async (tx) => {
        await record(tx, home, {
          type: "recipe.deleted",
          data: { recipe: lemonChicken() },
        })
        throw new Error("Rolled back")
      })
    ).rejects.toThrow("Rolled back")

    expect(await inHome().count(WebhookEvent, {})).toBe(0)
    expect(await inHome().count(WebhookDelivery, {})).toBe(0)
    expect(await deliveryJobs()).toHaveLength(0)
  })

  test("records nothing while webhooks are off", async () => {
    await addWebhook({ everything: true })
    const publicUrl = linkBase()

    configureWebhooks({ enabled: false, publicUrl: null })
    try {
      expect(await recordDeleted()).toBeNull()
    } finally {
      configureWebhooks({ enabled: true, publicUrl })
    }

    expect(await inHome().count(WebhookEvent, {})).toBe(0)
  })

  test("wantsEvent says whether any webhook wants an event", async () => {
    expect(await wantsEvent(inHome(), home, "recipe.deleted")).toBe(false)

    await addWebhook({ events: ["recipe.created"] })
    forgetWebhooks(home)
    expect(await wantsEvent(inHome(), home, "recipe.deleted")).toBe(false)
    expect(await wantsEvent(inHome(), home, "recipe.created")).toBe(true)

    const publicUrl = linkBase()
    configureWebhooks({ enabled: false, publicUrl: null })
    try {
      expect(await wantsEvent(inHome(), home, "recipe.created")).toBe(false)
    } finally {
      configureWebhooks({ enabled: true, publicUrl })
    }
  })

  test("says who did it", async () => {
    await addWebhook({ everything: true })
    const kyle: Actor = {
      by: { id: "u1", name: "Kyle" },
      via: "api",
      key: { id: "k1", name: "n8n" },
    }

    const inRequest = await withActor(kyle, recordDeleted)
    const onItsOwn = await recordDeleted()
    const toldWho = await withActor(kyle, () =>
      record(inHome(), home, {
        type: "recipe.deleted",
        data: { recipe: lemonChicken() },
        actor: MERRAN,
      })
    )

    expect(inRequest?.payload).toEqual({
      household: { id: home, name: "Home" },
      by: { id: "u1", name: "Kyle" },
      via: "api",
      key: { id: "k1", name: "n8n" },
      recipe: lemonChicken(),
    })
    expect(onItsOwn?.payload).toMatchObject(MERRAN)
    expect(toldWho?.payload).toMatchObject(MERRAN)
  })

  test("forgetting a household's webhooks picks up a new one", async () => {
    expect(await recordDeleted()).toBeNull()
    await addWebhook({ everything: true })

    // What the household's webhooks want is remembered until it's forgotten.
    expect(await recordDeleted()).toBeNull()
    forgetWebhooks(home)

    expect(await recordDeleted()).not.toBeNull()
    expect(await inHome().count(WebhookDelivery, {})).toBe(1)
  })

  test("a test goes to its one webhook, even a paused one, with no job", async () => {
    const paused = await addWebhook({ state: "paused" })

    const event = await record(inHome(), home, {
      type: "webhook.test",
      data: { webhook: { id: paused, name: "Home Assistant" } },
      only: paused,
    })

    expect(event).not.toBeNull()
    const deliveries = await inHome().find(WebhookDelivery, {})
    expect(deliveries.map((delivery) => delivery.webhook.id)).toEqual([paused])
    expect(await deliveryJobs()).toHaveLength(0)
  })
})

describe("actorOf", () => {
  const kyle = { id: "u1", name: "Kyle" }
  const apiKey = {
    kind: "apiKey",
    id: "k1",
    name: "n8n",
    permissions: { recipes: "write" },
  } as const
  const connection = (audience: "mcp" | "api") =>
    ({
      kind: "oauth",
      id: "o1",
      name: "Claude",
      clientId: "c1",
      audience,
      permissions: { recipes: "read" },
    }) as const

  test("actorOf tells a session, a key and MCP apart", () => {
    expect(
      actorOf(kyle, { kind: "session", id: "s1" }, "/api/recipes")
    ).toEqual({ by: kyle, via: "app", key: null })
    expect(actorOf(kyle, apiKey, "/api/recipes")).toEqual({
      by: kyle,
      via: "api",
      key: { id: "k1", name: "n8n" },
    })
    expect(actorOf(kyle, connection("api"), "/api/recipes")).toEqual({
      by: kyle,
      via: "api",
      key: { id: "o1", name: "Claude" },
    })
    expect(actorOf(kyle, connection("mcp"), "/mcp")).toEqual({
      by: kyle,
      via: "mcp",
      key: { id: "o1", name: "Claude" },
    })
    expect(actorOf(kyle, apiKey, "/mcp")).toEqual({
      by: kyle,
      via: "mcp",
      key: { id: "k1", name: "n8n" },
    })
    expect(actorOf(null, null, "/api/recipes")).toEqual(MERRAN)
  })
})
