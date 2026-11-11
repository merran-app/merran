import { pino } from "pino"
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
  Secret,
  Webhook,
  WebhookDelivery,
  WebhookEvent,
} from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { forHousehold } from "../../database/scope.ts"
import { createTestApp, setUpServer } from "../../test/app.ts"
import type { JobDeps } from "../jobs/runner.ts"
import type { Settings } from "../settings/settings.ts"
import { pauseWebhook } from "./pausing.ts"
import { newWebhookSecret } from "./signing.ts"
import { forgetWebhooks } from "./wanted.ts"

// Pausing emails the household's owners and admins, so email is set up, and
// nodemailer is a stand-in that keeps what it's asked to send.
const smtp = vi.hoisted(() => ({
  send: vi.fn(),
  close: vi.fn(),
  create: vi.fn(),
}))
vi.mock("nodemailer", () => ({ default: { createTransport: smtp.create } }))

let database: Database
let settings: Settings
let close: () => Promise<void>
let home: string

beforeAll(async () => {
  const test = await createTestApp({
    env: {
      MERRAN_EMAIL_ENABLED: "true",
      MERRAN_SMTP_HOST: "smtp.example.com",
      MERRAN_EMAIL_FROM: "webhooks@example.com",
    },
  })
  ;({ database, settings, close } = test)
  await setUpServer(test.app, test.setupCode)
  home = (await database.em.fork().findOneOrFail(Household, { name: "Home" }))
    .id
})

afterAll(() => close())

// Each test starts with no webhooks, and nothing sent.
beforeEach(async () => {
  vi.clearAllMocks()
  smtp.create.mockReturnValue({ sendMail: smtp.send, close: smtp.close })
  smtp.send.mockResolvedValue({ accepted: ["kyle@example.com"], rejected: [] })
  const em = inHome()
  await em.nativeDelete(WebhookDelivery, {})
  await em.nativeDelete(WebhookEvent, {})
  await em.nativeDelete(Webhook, {})
  forgetWebhooks(home)
})

/** An entity manager that sees only Home's rows, as a job's does. */
const inHome = () => forHousehold(database.em, home)

/** What pausing uses: the settings, to send email, and a quiet log. */
const deps = () =>
  ({
    settings,
    logger: pino({ level: "silent" }),
    config: { publicUrl: undefined },
  }) as unknown as Pick<JobDeps, "settings" | "logger" | "config">

/** An active webhook straight in the database. */
async function addWebhook() {
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
    events: [],
    everything: true,
  })
  await em.flush()
  return webhook.id
}

/** The webhook as one try loaded it: in its own entity manager. */
async function loaded(id: string) {
  const em = inHome()
  return { em, webhook: await em.findOneOrFail(Webhook, { id }) }
}

const webhookById = (id: string) => inHome().findOneOrFail(Webhook, { id })

describe("pausing", () => {
  test("two last tries finishing together pause it once, with one email", async () => {
    const id = await addWebhook()
    // Each try loaded the webhook while it was still active.
    const first = await loaded(id)
    const second = await loaded(id)

    await Promise.all([
      pauseWebhook(first.em, deps(), first.webhook, "gave_up"),
      pauseWebhook(second.em, deps(), second.webhook, "gave_up"),
    ])

    expect(await webhookById(id)).toMatchObject({
      state: "paused",
      pausedReason: "gave_up",
    })
    expect(smtp.send).toHaveBeenCalledTimes(1)
    expect(smtp.send.mock.calls[0]![0]).toMatchObject({
      subject: "Home Assistant is paused",
    })
  })

  test("a webhook paused by hand isn't said to have given up", async () => {
    const id = await addWebhook()
    const lastTry = await loaded(id)
    const byHand = await loaded(id)

    await pauseWebhook(byHand.em, deps(), byHand.webhook, "by_hand")
    await pauseWebhook(lastTry.em, deps(), lastTry.webhook, "gave_up")

    expect(await webhookById(id)).toMatchObject({
      state: "paused",
      pausedReason: "by_hand",
    })
    expect(smtp.send).not.toHaveBeenCalled()
    // What the try had loaded catches up with how it is.
    expect(lastTry.webhook).toMatchObject({
      state: "paused",
      pausedReason: "by_hand",
    })
  })
})
