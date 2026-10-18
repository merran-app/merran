import { afterEach, beforeEach, expect, test, vi } from "vitest"
import {
  Account,
  Job,
  PasswordReset,
  RateLimit,
  Secret,
  User,
} from "../../database/entities/index.ts"
import { resetPassword } from "../../services/auth/reset-password.ts"
import {
  createTestApp,
  setUpServer,
  TestClient,
  TEST_PASSWORD,
} from "../../test/app.ts"
import { cleanUpPasswordResets, resetRateLimit } from "./password-resets.ts"

const smtp = vi.hoisted(() => ({
  send: vi.fn(),
  close: vi.fn(),
  create: vi.fn(),
}))
vi.mock("nodemailer", () => ({ default: { createTransport: smtp.create } }))
let fixture: Awaited<ReturnType<typeof createTestApp>>
let admin: TestClient
let client: TestClient
const requestPath = "/api/auth/password-reset/request"
const completePath = "/api/auth/password-reset/complete"
const nextPassword = "another correct horse battery"

beforeEach(async () => {
  vi.clearAllMocks()
  smtp.create.mockReturnValue({ sendMail: smtp.send, close: smtp.close })
  smtp.send.mockResolvedValue({ accepted: ["kyle@example.com"], rejected: [] })
  fixture = await createTestApp({
    env: {
      MERRAN_SMTP_HOST: "smtp.example.com",
      MERRAN_EMAIL_FROM: "recovery@example.com",
    },
  })
  admin = await setUpServer(fixture.app, fixture.setupCode)
  await admin.patch("/api/settings/server", { "email.enabled": true })
  client = new TestClient(fixture.app)
})
afterEach(async () => {
  await fixture.jobs.stop()
  await fixture.close()
})

async function request(email = "kyle@example.com") {
  return client.post(requestPath, { email })
}
async function delivered() {
  expect((await request()).status).toBe(200)
  await fixture.jobs.start()
  await vi.waitFor(async () =>
    expect(
      (
        await fixture.database.em
          .fork()
          .findOneOrFail(Job, { kind: "email.passwordReset" })
      ).status
    ).toBe("done")
  )
  const message = smtp.send.mock.calls[0]![0]
  const token = /\/reset-password#([a-zA-Z0-9_-]{43})/.exec(message.text)?.[1]
  expect(token).toBeTruthy()
  return token!
}
const complete = (token: string, password = nextPassword) =>
  client.post(completePath, { token, password })

test("requests have identical responses and queued work for known and unknown addresses", async () => {
  const known = await request("Kyle@example.com")
  const unknown = await request("nobody@example.com")
  expect(known.status).toBe(200)
  expect(unknown.status).toBe(200)
  expect(await known.json()).toEqual(await unknown.json())
  const rows = await fixture.database.em.fork().find(PasswordReset, {})
  expect(rows).toHaveLength(2)
  expect(rows.every((row) => row.user === null)).toBe(true)
  const jobs = await fixture.database.em
    .fork()
    .find(Job, { kind: "email.passwordReset" })
  for (const job of jobs) expect(Object.keys(job.payload)).toEqual(["resetId"])
  expect(JSON.stringify(jobs)).not.toContain("kyle@example.com")
  expect(smtp.send).not.toHaveBeenCalled()
  expect(known.headers.get("cache-control")).toBe("no-store")
})

test("worker sends both formats, keeps tokens out of HTTP URLs and erases the sealed delivery after acceptance", async () => {
  const token = await delivered()
  expect(smtp.send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: { address: "kyle@example.com", name: "" },
      subject: "Reset your Merran password",
      html: expect.stringContaining(`/reset-password#${token}`),
    })
  )
  const reset = (await fixture.database.em.fork().find(PasswordReset, {}))[0]!
  expect(reset.tokenHash).not.toContain(token)
  expect(reset.delivery).toBeNull()
  expect(await fixture.database.em.fork().count(Secret, {})).toBe(0)
  const capability = await (await client.get("/api/capabilities")).json()
  expect(capability.capabilities).toContain("email.passwordReset")
})

test("reset changes credentials, revokes sessions, cannot be replayed and never verifies the email", async () => {
  const token = await delivered()
  const otherDevice = new TestClient(fixture.app)
  expect(
    (
      await otherDevice.post("/api/auth/sign-in/email", {
        email: "kyle@example.com",
        password: TEST_PASSWORD,
      })
    ).status
  ).toBe(200)
  expect((await complete(token)).status).toBe(200)
  expect((await admin.get("/api/households/current")).status).toBe(401)
  expect((await otherDevice.get("/api/households/current")).status).toBe(401)
  expect(
    (
      await client.post("/api/auth/sign-in/email", {
        email: "kyle@example.com",
        password: TEST_PASSWORD,
      })
    ).status
  ).not.toBe(200)
  expect(
    (
      await client.post("/api/auth/sign-in/email", {
        email: "kyle@example.com",
        password: nextPassword,
      })
    ).status
  ).toBe(200)
  expect((await complete(token)).status).toBe(400)
  expect(
    (
      await fixture.database.em
        .fork()
        .findOneOrFail(User, { email: "kyle@example.com" })
    ).emailVerified
  ).toBe(false)
})

test("a successful reset invalidates other delivered links for the same account", async () => {
  await request()
  await request()
  await fixture.jobs.start()
  await vi.waitFor(() => expect(smtp.send).toHaveBeenCalledTimes(2), {
    timeout: 10_000,
  })
  const tokens = smtp.send.mock.calls.map(
    ([message]) =>
      /\/reset-password#([a-zA-Z0-9_-]{43})/.exec(message.text)![1]!
  )
  expect((await complete(tokens[0]!)).status).toBe(200)
  expect((await complete(tokens[1]!)).status).toBe(400)
})

test("concurrent rate-limit increments admit only the configured number", async () => {
  const admitted = await Promise.all(
    Array.from({ length: 10 }, () =>
      resetRateLimit(
        fixture.database.em.fork(),
        "concurrency",
        "same client",
        5
      )
    )
  )
  expect(admitted.filter(Boolean)).toHaveLength(5)
})

test("a queued link cannot reset an account until its worker has bound the credentials", async () => {
  await request()
  const reset = (
    await fixture.database.em
      .fork()
      .find(PasswordReset, {}, { populate: ["delivery"] })
  )[0]!
  const { token } = JSON.parse(
    fixture.settings.open(reset.delivery!.getEntity())
  )
  expect((await complete(token)).status).toBe(400)
})

test("two concurrent completions claim the link once", async () => {
  const token = await delivered()
  const results = await Promise.all([complete(token), complete(token)])
  expect(results.map((result) => result.status).sort()).toEqual([200, 400])
})

test("bad or expired links and invalid passwords cannot change credentials or consume a valid link", async () => {
  const token = await delivered()
  expect((await complete("a".repeat(43))).status).toBe(400)
  expect((await complete(token, "short")).status).toBe(400)
  expect((await complete(token, "x".repeat(129))).status).toBe(400)
  await fixture.database.em
    .fork()
    .nativeUpdate(PasswordReset, {}, { expiresAt: new Date(0) })
  expect((await complete(token)).status).toBe(400)
  expect(
    (
      await client.post("/api/auth/sign-in/email", {
        email: "kyle@example.com",
        password: TEST_PASSWORD,
      })
    ).status
  ).toBe(200)
})

test("operator password changes invalidate older emailed links", async () => {
  const token = await delivered()
  await resetPassword(
    fixture.database.em.fork(),
    fixture.auth,
    "kyle",
    "operator replacement password"
  )
  expect((await complete(token)).status).toBe(400)
})

test("regular account password changes invalidate older emailed links", async () => {
  const token = await delivered()
  expect(
    (
      await admin.post("/api/auth/change-password", {
        currentPassword: TEST_PASSWORD,
        newPassword: "changed from account settings",
      })
    ).status
  ).toBe(200)
  expect((await complete(token)).status).toBe(400)
})

test("unknown accounts send no mail and drop their delivery secret", async () => {
  await request("nobody@example.com")
  await fixture.jobs.start()
  await vi.waitFor(async () =>
    expect(
      (
        await fixture.database.em
          .fork()
          .findOneOrFail(Job, { kind: "email.passwordReset" })
      ).status
    ).toBe("done")
  )
  expect(smtp.send).not.toHaveBeenCalled()
  expect(await fixture.database.em.fork().count(Secret, {})).toBe(0)
})

test("disabled SMTP preserves the generic response, and disabling it after delivery does not block reset", async () => {
  const token = await delivered()
  expect(
    (await admin.patch("/api/settings/server", { "email.enabled": false }))
      .status
  ).toBe(200)
  expect(await (await request()).json()).toEqual({ requested: true })
  expect(await fixture.database.em.fork().count(PasswordReset, {})).toBe(1)
  expect((await complete(token)).status).toBe(200)
})

test("request and attempt limits persist in the database; recipient suppression keeps the response generic", async () => {
  for (let i = 0; i < 5; i++) expect((await request()).status).toBe(200)
  expect(await fixture.database.em.fork().count(PasswordReset, {})).toBe(3)
  expect((await request()).status).toBe(429)
  for (let i = 0; i < 10; i++)
    expect((await complete("a".repeat(43))).status).toBe(400)
  expect((await complete("a".repeat(43))).status).toBe(429)
  expect(
    await fixture.database.em
      .fork()
      .count(RateLimit, { key: { $like: "password-reset:%" } })
  ).toBe(3)
})

test("temporary SMTP failure retries the same link without storing plaintext in job errors", async () => {
  smtp.send.mockRejectedValueOnce(new Error("SMTP reply with private content"))
  await request()
  await fixture.jobs.start()
  await vi.waitFor(async () => {
    const job = await fixture.database.em
      .fork()
      .findOneOrFail(Job, { kind: "email.passwordReset" })
    expect(job.attempts).toBe(1)
    expect(job.status).toBe("queued")
    expect(job.error).not.toContain("private content")
  })
  await fixture.database.em
    .fork()
    .nativeUpdate(Job, { kind: "email.passwordReset" }, { runAt: new Date(0) })
  fixture.jobs.wake()
  await vi.waitFor(async () =>
    expect(
      (
        await fixture.database.em
          .fork()
          .findOneOrFail(Job, { kind: "email.passwordReset" })
      ).status
    ).toBe("done")
  )
  expect(smtp.send.mock.calls[0]![0].text).toBe(
    smtp.send.mock.calls[1]![0].text
  )
})

test("expired queued requests skip sending and daily cleanup removes retained secrets and rows", async () => {
  await request()
  await fixture.database.em
    .fork()
    .nativeUpdate(PasswordReset, {}, { expiresAt: new Date(0) })
  await fixture.jobs.start()
  await vi.waitFor(async () =>
    expect(
      (
        await fixture.database.em
          .fork()
          .findOneOrFail(Job, { kind: "email.passwordReset" })
      ).status
    ).toBe("done")
  )
  expect(smtp.send).not.toHaveBeenCalled()
  await cleanUpPasswordResets(fixture.database.em.fork())
  expect(await fixture.database.em.fork().count(Secret, {})).toBe(0)
  expect(await fixture.database.em.fork().count(PasswordReset, {})).toBe(0)
})
