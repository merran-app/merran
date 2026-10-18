import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../app.ts"
import { AppError } from "../../core/errors.ts"
import { Job } from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import type {
  FetchedResource,
  FetchOptions,
} from "../../services/fetch/public-fetch.ts"
import { enqueue } from "../../services/jobs/jobs.ts"
import type { JobRunner } from "../../services/jobs/runner.ts"
import { createTestApp, setUpServer, TestClient } from "../../test/app.ts"
import { RECEIVER_URL, TELEMETRY_URL } from "./receiver.ts"

let app: App
let close: () => Promise<void>
let database: Database
let jobs: JobRunner
let kyle: TestClient
let sent: { url: string; options: FetchOptions | undefined }[] = []
/** How the receiver answers: a status and body, or "down". */
let answer: { status: number; body?: string } | "down" = { status: 204 }

beforeAll(async () => {
  const test = await createTestApp({
    fetcher: async (url, options): Promise<FetchedResource> => {
      sent.push({ url, options })
      if (answer === "down") {
        throw new AppError(
          "upstream",
          "site_unreachable",
          "Couldn't reach that site."
        )
      }
      return {
        url,
        status: answer.status,
        contentType: "application/json",
        body: Buffer.from(answer.body ?? ""),
      }
    },
  })
  ;({ app, close, database, jobs } = test)
  kyle = await setUpServer(app, test.setupCode)
})

afterAll(() => close())

async function sendSummary() {
  sent = []
  // Tried once, as the schedule does.
  const job = await enqueue(database.em.fork(), {
    kind: "telemetry.send",
    maxAttempts: 1,
  })
  await jobs.drain()
  return database.em.fork().findOneOrFail(Job, { id: job.id })
}

async function status() {
  return (await kyle.get("/api/telemetry/status")).json()
}

describe("the daily telemetry summary", () => {
  test("isn't sent unless the server admin says yes", async () => {
    expect((await sendSummary()).result).toEqual({ sent: false })
    expect(sent).toEqual([])
    expect(await status()).toMatchObject({
      receiving: true,
      ask: true,
      last: null,
    })
  })

  test("is sent, exactly as Settings shows it, once they do", async () => {
    await kyle.patch("/api/settings/server", { "telemetry.enabled": true })
    const shown = await (await kyle.get("/api/telemetry/report")).json()

    expect((await sendSummary()).result).toEqual({ sent: true })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url).toBe(TELEMETRY_URL)
    expect(sent[0]!.options?.json).toEqual(shown)
    expect((await status()).last).toMatchObject({
      outcome: "sent",
      detail: null,
    })
  })

  test("isn't a failed job when the receiver can't be reached", async () => {
    for (const down of ["down", { status: 503 }, { status: 429 }] as const) {
      answer = down
      const job = await sendSummary()
      expect(job.status).toBe("done")
      expect(job.result).toEqual({ sent: false, outcome: "unreachable" })
      expect((await status()).last.outcome).toBe("unreachable")
    }
  })

  test("is a failed job, saying why, when the receiver refuses it", async () => {
    answer = { status: 400, body: '{"error":"version: Invalid input"}' }
    const job = await sendSummary()
    expect(job.status).toBe("failed")
    expect(job.error).toContain("version: Invalid input")
    expect((await status()).last).toMatchObject({
      outcome: "refused",
      detail: "version: Invalid input",
    })
  })

  test("stops, without failing, once this version isn't collected", async () => {
    answer = { status: 410 }
    const job = await sendSummary()
    expect(job.status).toBe("done")
    expect(job.result).toEqual({ sent: false, outcome: "retired" })
    expect((await status()).last.outcome).toBe("retired")
  })

  test("asks the receiver to forget the old id after a new one", async () => {
    answer = { status: 204 }
    const old = (await (await kyle.get("/api/telemetry/report")).json())
      .installId
    await sendSummary()
    await kyle.post("/api/telemetry/install-id")

    await sendSummary()
    expect(sent.map(({ url, options }) => [options?.method, url])).toEqual([
      ["DELETE", `${RECEIVER_URL}/v1/installs/${old}`],
      [undefined, TELEMETRY_URL],
    ])

    // Only once.
    await sendSummary()
    expect(sent.map(({ url }) => url)).toEqual([TELEMETRY_URL])
  })

  test("asks it to forget this server once telemetry's off, then sends nothing", async () => {
    const id = (await (await kyle.get("/api/telemetry/report")).json())
      .installId
    await kyle.patch("/api/settings/server", { "telemetry.enabled": false })

    expect((await sendSummary()).result).toEqual({ sent: false })
    expect(sent.map(({ url, options }) => [options?.method, url])).toEqual([
      ["DELETE", `${RECEIVER_URL}/v1/installs/${id}`],
    ])

    await sendSummary()
    expect(sent).toEqual([])
  })
})

describe("the question after setup", () => {
  async function freshServer(env: Record<string, string> = {}) {
    const fresh = await createTestApp({ env })
    const admin = await setUpServer(fresh.app, fresh.setupCode)
    const ask = async () =>
      (await (await admin.get("/api/telemetry/status")).json()).ask
    const enabled = async () => {
      const { settings } = await (
        await admin.get("/api/settings/server")
      ).json()
      return settings.find(
        (s: { key: string }) => s.key === "telemetry.enabled"
      )
    }
    return { fresh, admin, ask, enabled }
  }

  test("is asked once, and yes turns telemetry on", async () => {
    const { fresh, admin, ask, enabled } = await freshServer()
    try {
      expect(await ask()).toBe(true)
      const res = await admin.post("/api/telemetry/answer", { send: true })
      expect(res.status).toBe(200)
      expect((await res.json()).ask).toBe(false)
      expect(await enabled()).toMatchObject({ value: true, source: "saved" })

      // A second answer, from another tab, changes nothing.
      await admin.post("/api/telemetry/answer", { send: false })
      expect(await enabled()).toMatchObject({ value: true })
    } finally {
      await fresh.close()
    }
  })

  test("no keeps it off, and isn't asked again", async () => {
    const { fresh, admin, ask, enabled } = await freshServer()
    try {
      await admin.post("/api/telemetry/answer", { send: false })
      expect(await ask()).toBe(false)
      expect(await enabled()).toMatchObject({ value: false, source: "saved" })
    } finally {
      await fresh.close()
    }
  })

  test("isn't asked once they've chosen in Settings", async () => {
    const { fresh, admin, ask } = await freshServer()
    try {
      await admin.patch("/api/settings/server", { "telemetry.enabled": false })
      expect(await ask()).toBe(false)
    } finally {
      await fresh.close()
    }
  })

  test("isn't asked when the environment has decided", async () => {
    const { fresh, ask } = await freshServer({ MERRAN_TELEMETRY: "off" })
    try {
      expect(await ask()).toBe(false)
    } finally {
      await fresh.close()
    }
  })
})
