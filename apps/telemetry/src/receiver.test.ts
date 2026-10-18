import { randomUUID } from "node:crypto"
import type { TelemetryReport } from "@merran/shared/telemetry"
import { beforeEach, describe, expect, test } from "vitest"
import { createApp } from "./app.ts"
import { runDaily } from "./daily/run.ts"
import { utcDay } from "./days.ts"
import type { Env, RateLimiter } from "./env.ts"
import { testDatabase } from "./test/database.ts"

const app = createApp()
let db: ReturnType<typeof testDatabase>
let env: Env

beforeEach(() => {
  db = testDatabase()
  env = { DB: db }
})

function summary(changes: Partial<TelemetryReport> = {}) {
  return {
    installId: randomUUID(),
    version: "0.1.0-alpha.2",
    install: "docker",
    arch: "arm64",
    database: "sqlite",
    modules: { ai: true, photos: false },
    aiProviders: ["anthropic"],
    households: "1",
    people: "2-5",
    recipes: "100-499",
    ...changes,
  } satisfies TelemetryReport
}

function send(body: unknown, headers: Record<string, string> = {}) {
  return app.request(
    "/v1/reports",
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    env
  )
}

const rows = () => db.sqlite.prepare("SELECT * FROM installs").all()

describe("a summary", () => {
  test("is kept as sent, with the day and nothing else", async () => {
    const sent = summary()
    const res = await send(sent, { "cf-connecting-ip": "203.0.113.7" })

    expect(res.status).toBe(204)
    expect(rows()).toEqual([
      {
        install_id: sent.installId,
        version: "0.1.0-alpha.2",
        install: "docker",
        arch: "arm64",
        db: "sqlite",
        modules: '{"ai":true,"photos":false}',
        ai_providers: '["anthropic"]',
        households: "1",
        people: "2-5",
        recipes: "100-499",
        first_day: utcDay(new Date()),
        last_day: utcDay(new Date()),
      },
    ])
    expect(JSON.stringify(rows())).not.toContain("203.0.113.7")
  })

  test("sent twice in a day is one server", async () => {
    const first = summary()
    await send(first)
    await send({ ...first, version: "0.1.0-alpha.3" })
    expect(rows()).toMatchObject([{ version: "0.1.0-alpha.3" }])
  })

  test("from 0.1.0-alpha.1, without AI providers, is kept", async () => {
    const { aiProviders: _, ...first } = summary()
    expect((await send(first)).status).toBe(204)
    expect(rows()).toMatchObject([{ ai_providers: null }])
  })

  test("is turned down, saying why, and only counted", async () => {
    const refused = [
      await send(summary({ version: "latest" })),
      await send({ ...summary(), hostname: "kitchen" }),
      await send("{not json"),
      await send(summary(), { "content-type": "text/plain" }),
      await send({ ...summary(), padding: "x".repeat(5000) }),
    ]

    expect(refused.map((res) => res.status)).toEqual([400, 400, 400, 415, 413])
    expect(await refused[0]!.json()).toEqual({
      error: expect.stringMatching(/^version: /),
    })
    expect(await refused[1]!.json()).toEqual({
      error: "Not part of the summary: hostname",
    })
    expect(rows()).toEqual([])
    expect(
      db.sqlite.prepare("SELECT reason, count FROM rejections").all()
    ).toEqual(
      expect.arrayContaining([
        { reason: "invalid_version", count: 1 },
        { reason: "unknown_field", count: 1 },
        { reason: "not_json", count: 2 },
        { reason: "too_large", count: 1 },
      ])
    )
  })

  test("from one address too often is told to wait", async () => {
    const seen: string[] = []
    const limiter: RateLimiter = {
      async limit({ key }) {
        seen.push(key)
        return { success: seen.length <= 10 }
      },
    }
    env = { DB: db, REPORT_LIMIT: limiter }
    for (let i = 0; i < 10; i++) {
      expect(
        (await send(summary(), { "cf-connecting-ip": "1.2.3.4" })).status
      ).toBe(204)
    }
    const res = await send(summary(), { "cf-connecting-ip": "1.2.3.4" })
    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("60")
    expect(new Set(seen)).toEqual(new Set(["1.2.3.4"]))
  })
})

describe("forgetting a server", () => {
  test("removes its row at once", async () => {
    const sent = summary()
    await send(sent)
    const res = await app.request(
      `/v1/installs/${sent.installId}`,
      { method: "DELETE" },
      env
    )
    expect(res.status).toBe(204)
    expect(rows()).toEqual([])
  })

  test("needs an install id", async () => {
    const res = await app.request(
      "/v1/installs/kitchen",
      { method: "DELETE" },
      env
    )
    expect(res.status).toBe(400)
  })
})

describe("the totals", () => {
  test("aren't there before the first night", async () => {
    expect((await app.request("/v1/totals", {}, env)).status).toBe(404)
  })

  test("are the newest night's, for any site to read", async () => {
    await send(summary())
    const tomorrow = new Date(Date.now() + 86_400_000)
    await runDaily(env, tomorrow, async () => new Response("[]"))

    const res = await app.request("/v1/totals", {}, env)
    expect(res.status).toBe(200)
    expect(res.headers.get("access-control-allow-origin")).toBe("*")
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600")
    expect(await res.json()).toMatchObject({
      day: utcDay(new Date()),
      servers: 1,
      new: 1,
    })

    const history = await (await app.request("/v1/history", {}, env)).json()
    expect(history).toEqual([
      { day: utcDay(new Date()), servers: 1, versions: { Other: 1 } },
    ])
  })
})

test("the address itself goes to the public page", async () => {
  const res = await app.request("/", {}, env)
  expect(res.status).toBe(302)
  expect(res.headers.get("location")).toBe("https://merran.app/telemetry")
})
