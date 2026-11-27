import { afterAll, beforeAll, expect, test } from "vitest"
import {
  OauthAccessToken,
  OauthClient,
  OauthClientAssertion,
  OauthRefreshToken,
  RateLimit,
  Session,
  User,
  Verification,
} from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { createTestDatabase } from "../../test/database.ts"
import { clearExpiredSignIns, KEEP_RATE_LIMITS_MS } from "./clean-up.ts"

let database: Database
let close: () => Promise<void>

beforeAll(async () => {
  ;({ database, close } = await createTestDatabase())
})

afterAll(() => close())

const now = new Date("2026-11-27T12:00:00Z")
const past = new Date(now.getTime() - 60_000)
const future = new Date(now.getTime() + 60_000)

test("expired sessions, verifications and tokens go, and live ones stay", async () => {
  const em = database.em.fork()
  const user = em.create(User, { name: "Kyle", email: "kyle@example.com" })
  const client = em.create(OauthClient, {
    clientId: "app",
    redirectUris: ["https://app.test/callback"],
  })
  em.create(Session, { token: "old", expiresAt: past, user })
  em.create(Session, { token: "live", expiresAt: future, user })
  em.create(Verification, { identifier: "a", value: "1", expiresAt: past })
  em.create(Verification, { identifier: "b", value: "2", expiresAt: future })
  for (const [token, expiresAt] of [
    ["old", past],
    ["live", future],
  ] as const) {
    em.create(OauthAccessToken, {
      token,
      client,
      expiresAt,
      createdAt: now,
      scopes: [],
    })
    em.create(OauthRefreshToken, {
      token,
      client,
      user,
      expiresAt,
      createdAt: now,
      scopes: [],
    })
  }
  em.create(OauthClientAssertion, { expiresAt: past })
  em.create(OauthClientAssertion, { expiresAt: future })
  await em.flush()

  const cleared = await clearExpiredSignIns(database.em.fork(), now)

  expect(cleared).toMatchObject({
    sessions: 1,
    verifications: 1,
    tokens: 3,
  })
  const check = database.em.fork()
  expect((await check.find(Session, {})).map((row) => row.token)).toEqual([
    "live",
  ])
  expect(
    (await check.find(Verification, {})).map((row) => row.identifier)
  ).toEqual(["b"])
  expect(
    (await check.find(OauthAccessToken, {})).map((row) => row.token)
  ).toEqual(["live"])
  expect(
    (await check.find(OauthRefreshToken, {})).map((row) => row.token)
  ).toEqual(["live"])
  expect(await check.count(OauthClientAssertion, {})).toBe(1)
})

test("rate limits idle for a day go", async () => {
  const em = database.em.fork()
  em.create(RateLimit, {
    key: "idle",
    count: 3,
    lastRequest: now.getTime() - KEEP_RATE_LIMITS_MS - 1,
  })
  em.create(RateLimit, {
    key: "busy",
    count: 1,
    lastRequest: now.getTime() - KEEP_RATE_LIMITS_MS + 60_000,
  })
  await em.flush()

  const cleared = await clearExpiredSignIns(database.em.fork(), now)

  expect(cleared.rateLimits).toBe(1)
  const left = await database.em.fork().find(RateLimit, {})
  expect(left.map((row) => row.key)).toEqual(["busy"])
})
