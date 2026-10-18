import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { InviteLink, Job, Secret, User } from "../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../database/scope.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../test/app.ts"
import {
  clearExpiredInvitationTokens,
  invitationOrigin,
} from "./invitations.ts"

const smtp = vi.hoisted(() => ({
  send: vi.fn(),
  close: vi.fn(),
  create: vi.fn(),
}))
vi.mock("nodemailer", () => ({ default: { createTransport: smtp.create } }))

let fixture: Awaited<ReturnType<typeof createTestApp>>
let admin: TestClient
const path = "/api/households/current/invites/email"

beforeEach(async () => {
  vi.clearAllMocks()
  smtp.create.mockReturnValue({ sendMail: smtp.send, close: smtp.close })
  smtp.send.mockResolvedValue({ accepted: ["jamie@example.com"], rejected: [] })
  fixture = await createTestApp({
    env: {
      MERRAN_EMAIL_ENABLED: "true",
      MERRAN_SMTP_HOST: "smtp.example.com",
      MERRAN_EMAIL_FROM: "invites@example.com",
    },
  })
  admin = await setUpServer(fixture.app, fixture.setupCode)
})
afterEach(async () => {
  await fixture.jobs.stop()
  await fixture.close()
})

async function queued(email = "jamie@example.com") {
  const response = await admin.post(path, { email, role: "member" })
  expect(response.status, await response.clone().text()).toBe(201)
  return await response.json()
}
async function tokenFor(id: string) {
  const invite = await fixture.database.em
    .fork()
    .findOneOrFail(InviteLink, id, {
      ...ACROSS_HOUSEHOLDS,
      populate: ["deliveryToken"],
    })
  return fixture.settings.open(invite.deliveryToken!.getEntity())
}

test("queues an address-bound invitation without returning or storing a plaintext token in jobs", async () => {
  const invite = await queued("Jamie@example.com")
  expect(invite).toMatchObject({
    email: "jamie@example.com",
    delivery: "queued",
  })
  expect(invite).not.toHaveProperty("link")
  const token = await tokenFor(invite.id)
  const job = await fixture.database.em
    .fork()
    .findOneOrFail(Job, { kind: "email.invitation" })
  expect(job.payload).toEqual({ inviteId: invite.id })
  expect(
    JSON.stringify(await fixture.database.em.fork().find(Secret, {}))
  ).not.toContain(token)
  expect(smtp.send).not.toHaveBeenCalled()
  const preview = await new TestClient(fixture.app).get(
    `/api/auth/join/${token}`
  )
  expect(await preview.json()).toMatchObject({ email: "jamie@example.com" })
})

test("wrong-address registration creates no account, correct registration consumes the invitation and drops its secret", async () => {
  const invite = await queued()
  const token = await tokenFor(invite.id)
  const client = new TestClient(fixture.app)
  expect(
    (
      await client.post(`/api/auth/join/${token}`, {
        account: account("wrong"),
      })
    ).status
  ).toBe(403)
  expect(
    await fixture.database.em.fork().count(User, { email: "wrong@example.com" })
  ).toBe(0)
  expect(
    (
      await client.post(`/api/auth/join/${token}`, {
        account: account("jamie"),
      })
    ).status
  ).toBe(201)
  expect((await client.post(`/api/auth/join/${token}`)).status).toBe(410)
  const row = await fixture.database.em
    .fork()
    .findOneOrFail(InviteLink, invite.id, ACROSS_HOUSEHOLDS)
  expect(row.deliveryToken).toBeNull()
  expect(await fixture.database.em.fork().count(Secret, {})).toBe(0)
})

test("signed-in users must match the address, and an existing account can join a second household", async () => {
  const member = await join(
    fixture.app,
    await inviteToken(admin),
    account("member")
  )
  const otherAdmin = await setUpAnotherHousehold()
  const response = await otherAdmin.post(path, { email: "member@example.com" })
  expect(response.status).toBe(201)
  const token = await tokenFor((await response.json()).id)
  expect((await admin.post(`/api/auth/join/${token}`)).status).toBe(403)
  expect((await member.post(`/api/auth/join/${token}`)).status).toBe(200)
})

async function setUpAnotherHousehold() {
  const { Household, HouseholdMember, User } =
    await import("../../database/entities/index.ts")
  const em = fixture.database.em.fork()
  const owner = await em.findOneOrFail(User, { email: "kyle@example.com" })
  const household = em.create(Household, { name: "Other", slug: "other" })
  em.create(HouseholdMember, { household, user: owner, role: "owner" })
  await em.flush()
  const response = await admin.post("/api/auth/organization/set-active", {
    organizationId: household.id,
  })
  expect(response.status).toBe(200)
  return admin
}

test("delivery runs as a durable job, uses the configured origin, and records provider acceptance", async () => {
  const invite = await queued()
  const token = await tokenFor(invite.id)
  await fixture.jobs.start()
  await vi.waitFor(async () => {
    const job = await fixture.database.em
      .fork()
      .findOneOrFail(Job, { kind: "email.invitation" })
    expect(job.status).toBe("done")
  })
  expect(smtp.send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: { address: "jamie@example.com", name: "" },
      text: expect.stringContaining(`http://merran.test/join/${token}`),
      html: expect.stringContaining(`href="http://merran.test/join/${token}"`),
    })
  )
  const listed = await (
    await admin.get("/api/households/current/invites")
  ).json()
  expect(listed.find((i: { id: string }) => i.id === invite.id).delivery).toBe(
    "accepted"
  )
})

test("cancellation invalidates the link, erases its secret and prevents queued delivery", async () => {
  const invite = await queued()
  const token = await tokenFor(invite.id)
  expect(
    (await admin.delete(`/api/households/current/invites/${invite.id}`)).status
  ).toBe(204)
  expect((await admin.get(`/api/auth/join/${token}`)).status).toBe(404)
  await fixture.jobs.start()
  await vi.waitFor(async () =>
    expect(
      (
        await fixture.database.em
          .fork()
          .findOneOrFail(Job, { kind: "email.invitation" })
      ).status
    ).toBe("done")
  )
  expect(smtp.send).not.toHaveBeenCalled()
  expect(await fixture.database.em.fork().count(Secret, {})).toBe(0)
})

test("duplicates, existing members, non-admins and cross-household resend are refused", async () => {
  const invite = await queued()
  expect((await admin.post(path, { email: "JAMIE@example.com" })).status).toBe(
    409
  )
  expect((await admin.post(path, { email: "kyle@example.com" })).status).toBe(
    409
  )
  const member = await join(
    fixture.app,
    await inviteToken(admin),
    account("member")
  )
  expect((await member.post(path, { email: "x@example.com" })).status).toBe(403)
  expect(
    (await new TestClient(fixture.app).post(path, { email: "x@example.com" }))
      .status
  ).toBe(401)
  await setUpAnotherHousehold()
  expect(
    (await admin.post(`/api/households/current/invites/${invite.id}/resend`))
      .status
  ).toBe(404)
  expect(
    (await admin.delete(`/api/households/current/invites/${invite.id}`)).status
  ).toBe(404)
})

test("resends wait a minute, refuse active jobs, reuse the token and keep expiry", async () => {
  const invite = await queued()
  const token = await tokenFor(invite.id)
  const resend = `/api/households/current/invites/${invite.id}/resend`
  expect((await admin.post(resend)).status).toBe(429)
  const em = fixture.database.em.fork()
  await em.nativeUpdate(
    InviteLink,
    { id: invite.id },
    { queuedAt: new Date(Date.now() - 61_000) },
    ACROSS_HOUSEHOLDS
  )
  expect((await admin.post(resend)).status).toBe(409)
  await em.nativeUpdate(Job, { kind: "email.invitation" }, { status: "failed" })
  const response = await admin.post(resend)
  expect(response.status).toBe(200)
  expect((await response.json()).expiresAt).toBe(invite.expiresAt)
  expect(await tokenFor(invite.id)).toBe(token)
  expect(await em.count(Job, { kind: "email.invitation" })).toBe(2)
})

test("invitations require an operator-configured origin and enabled SMTP", async () => {
  for (const url of [
    undefined,
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com?next=bad",
    "https://example.com/#bad",
  ])
    expect(() => invitationOrigin(url)).toThrow()
  expect(invitationOrigin("https://merran.example.com")).toBe(
    "https://merran.example.com"
  )
  // Locked environment credentials do not become editable through the API.
  expect(
    (await admin.patch("/api/settings/server", { "email.enabled": false }))
      .status
  ).toBe(400)
})

test("temporary delivery failures retry the same invitation without exposing content in job errors", async () => {
  smtp.send.mockRejectedValueOnce(
    new Error("SMTP response containing a secret")
  )
  const invite = await queued()
  const token = await tokenFor(invite.id)
  await fixture.jobs.start()
  await vi.waitFor(async () => {
    const job = await fixture.database.em
      .fork()
      .findOneOrFail(Job, { kind: "email.invitation" })
    expect(job.status).toBe("queued")
    expect(job.attempts).toBe(1)
    expect(job.error).not.toContain("SMTP response")
  })
  await fixture.database.em
    .fork()
    .nativeUpdate(Job, { kind: "email.invitation" }, { runAt: new Date(0) })
  fixture.jobs.wake()
  await vi.waitFor(async () =>
    expect(
      (
        await fixture.database.em
          .fork()
          .findOneOrFail(Job, { kind: "email.invitation" })
      ).status
    ).toBe("done")
  )
  expect(smtp.send).toHaveBeenCalledTimes(2)
  for (const [message] of smtp.send.mock.calls)
    expect(message.text).toContain(`/join/${token}`)
})

test("expired invitations cannot be accepted or resent, skip delivery, and lose retained tokens", async () => {
  const invite = await queued()
  const token = await tokenFor(invite.id)
  await fixture.database.em
    .fork()
    .nativeUpdate(
      InviteLink,
      { id: invite.id },
      { expiresAt: new Date(0) },
      ACROSS_HOUSEHOLDS
    )
  expect((await admin.get(`/api/auth/join/${token}`)).status).toBe(410)
  expect(
    (await admin.post(`/api/households/current/invites/${invite.id}/resend`))
      .status
  ).toBe(404)
  await fixture.jobs.start()
  await vi.waitFor(async () =>
    expect(
      (
        await fixture.database.em
          .fork()
          .findOneOrFail(Job, { kind: "email.invitation" })
      ).status
    ).toBe("done")
  )
  expect(smtp.send).not.toHaveBeenCalled()
  await clearExpiredInvitationTokens(fixture.database.em.fork())
  expect(await fixture.database.em.fork().count(Secret, {})).toBe(0)
})

test("the hourly limit includes resends and refuses another email job", async () => {
  const invite = await queued()
  const em = fixture.database.em.fork()
  const first = await em.findOneOrFail(Job, { kind: "email.invitation" })
  for (let i = 0; i < 19; i++)
    em.create(Job, {
      kind: "email.invitation",
      payload: { inviteId: invite.id },
      forHousehold: first.forHousehold,
      runAt: new Date(),
    })
  await em.flush()
  expect((await admin.post(path, { email: "next@example.com" })).status).toBe(
    429
  )
  expect(await em.count(Job, { kind: "email.invitation" })).toBe(20)
})

test("SMTP being disabled leaves copyable invitations usable", async () => {
  await fixture.jobs.stop()
  await fixture.close()
  fixture = await createTestApp()
  admin = await setUpServer(fixture.app, fixture.setupCode)
  expect((await admin.post(path, { email: "jamie@example.com" })).status).toBe(
    400
  )
  const token = await inviteToken(admin)
  expect(
    (
      await new TestClient(fixture.app).post(`/api/auth/join/${token}`, {
        account: account("jamie"),
      })
    ).status
  ).toBe(201)
})

test("concurrent requests for the same address create only one invitation and job", async () => {
  const responses = await Promise.all([
    admin.post(path, { email: "jamie@example.com" }),
    admin.post(path, { email: "JAMIE@example.com" }),
  ])
  expect(responses.map((response) => response.status).sort()).toEqual([
    201, 409,
  ])
  expect(
    await fixture.database.em
      .fork()
      .count(InviteLink, { email: "jamie@example.com" }, ACROSS_HOUSEHOLDS)
  ).toBe(1)
  expect(
    await fixture.database.em.fork().count(Job, { kind: "email.invitation" })
  ).toBe(1)
})

test("email addresses are rejected before storage when they exceed the mailbox length limit", async () => {
  const email = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.com`
  expect((await admin.post(path, { email })).status).toBe(400)
  expect(
    await fixture.database.em.fork().count(Job, { kind: "email.invitation" })
  ).toBe(0)
})
