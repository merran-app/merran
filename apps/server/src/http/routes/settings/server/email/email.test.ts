import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest"
import { emailConfiguration } from "../../../../../modules/email/sender.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../../../test/app.ts"

const smtp = vi.hoisted(() => ({
  send: vi.fn(),
  close: vi.fn(),
  create: vi.fn(),
}))
vi.mock("nodemailer", () => ({ default: { createTransport: smtp.create } }))

let fixture: Awaited<ReturnType<typeof createTestApp>>
let admin: TestClient
let member: TestClient
const path = "/api/settings/server/email/test"

beforeAll(async () => {
  fixture = await createTestApp()
  admin = await setUpServer(fixture.app, fixture.setupCode)
  member = await join(fixture.app, await inviteToken(admin), account("member"))
})
afterAll(() => fixture.close())
beforeEach(() => {
  vi.clearAllMocks()
  smtp.create.mockReturnValue({ sendMail: smtp.send, close: smtp.close })
  smtp.send.mockResolvedValue({ accepted: ["kyle@example.com"], rejected: [] })
})

test("email starts disabled, and refuses sending without contacting a provider", async () => {
  expect(await emailConfiguration(fixture.settings)).toEqual({
    on: false,
    needs: "disabled",
  })
  expect((await admin.post(path)).status).toBe(400)
  expect(smtp.create).not.toHaveBeenCalled()
})

test("only server admins can send tests or change SMTP settings", async () => {
  expect((await new TestClient(fixture.app).post(path)).status).toBe(401)
  expect((await member.post(path)).status).toBe(403)
  expect(
    (
      await member.patch("/api/settings/server", {
        "email.host": "smtp.example.com",
      })
    ).status
  ).toBe(403)
  expect(smtp.create).not.toHaveBeenCalled()
})

test("SMTP configuration is validated and passwords are never returned", async () => {
  for (const change of [
    { "email.port": 0 },
    { "email.port": 65536 },
    { "email.security": "none" },
    { "email.from": "bad\r\nBcc: other@example.com" },
  ]) {
    expect((await admin.patch("/api/settings/server", change)).status).toBe(400)
  }
  const response = await admin.patch("/api/settings/server", {
    "email.enabled": true,
    "email.host": "smtp.resend.com",
    "email.port": 465,
    "email.security": "tls",
    "email.username": "resend",
    "email.password": "re_test_secret_123456",
    "email.from": "invites@example.com",
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(JSON.stringify(body)).not.toContain("re_test_secret_123456")
  expect(
    body.settings.find((s: { key: string }) => s.key === "email.password")
  ).toMatchObject({ value: null, secret: { set: true } })
})

test("test email uses saved Resend SMTP settings and the administrator's own address", async () => {
  // Extra request fields cannot choose a recipient or replace the fixed message.
  expect(
    (await admin.post(path, { to: "someone@example.com", text: "replacement" }))
      .status
  ).toBe(200)
  expect(smtp.create).toHaveBeenCalledWith(
    expect.objectContaining({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      requireTLS: false,
      auth: { user: "resend", pass: "re_test_secret_123456" },
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    })
  )
  expect(smtp.send).toHaveBeenCalledWith(
    expect.objectContaining({
      from: { name: "Merran", address: "invites@example.com" },
      to: { address: "kyle@example.com", name: "" },
      subject: "Merran test email",
      html: expect.stringContaining("You’ve got good mail."),
    })
  )
  expect(smtp.close).toHaveBeenCalledOnce()
})

test("provider errors and refused recipients are safe and always close the transport", async () => {
  smtp.send.mockRejectedValueOnce(
    new Error("provider response with re_test_secret_123456")
  )
  const response = await admin.post(path)
  expect(response.status).toBe(502)
  expect(await response.text()).not.toContain("re_test_secret_123456")
  smtp.send.mockResolvedValueOnce({
    accepted: [],
    rejected: ["kyle@example.com"],
  })
  expect((await admin.post(path)).status).toBe(502)
  expect(smtp.close).toHaveBeenCalledTimes(2)
})

test("STARTTLS requires encryption, trusted relays omit authentication, incomplete credentials refuse sending", async () => {
  await admin.patch("/api/settings/server", {
    "email.security": "starttls",
    "email.port": 587,
    "email.username": null,
    "email.password": null,
  })
  expect((await admin.post(path)).status).toBe(200)
  expect(smtp.create).toHaveBeenLastCalledWith(
    expect.objectContaining({ secure: false, requireTLS: true, port: 587 })
  )
  expect(smtp.create.mock.lastCall?.[0]).not.toHaveProperty("auth")
  smtp.create.mockClear()
  await admin.patch("/api/settings/server", { "email.username": "resend" })
  expect((await admin.post(path)).status).toBe(400)
  expect(smtp.create).not.toHaveBeenCalled()
})
