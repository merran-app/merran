import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
  createTestApp,
  setUpServer,
  TEST_PASSWORD,
  TEST_SECRET,
  TestClient,
} from "../../test/app.ts"
import { Session, User, TwoFactor } from "../../database/entities/index.ts"
import { symmetricDecrypt, parseEnvelope } from "better-auth/crypto"
import { rotateAuthSecrets } from "../../services/auth/rotate-secrets.ts"
import { resetSecondFactor } from "../../services/auth/recover.ts"
import { createHmac } from "node:crypto"

function authenticatorCode(secret: string) {
  const bits = [...secret.replace(/=+$/, "")]
    .map((letter) =>
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
        .indexOf(letter)
        .toString(2)
        .padStart(5, "0")
    )
    .join("")
  const bytes = Buffer.from(
    bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2))
  )
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = createHmac("sha1", bytes).update(counter).digest()
  const offset = digest[digest.length - 1]! & 15
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, "0")
}

let setup: Awaited<ReturnType<typeof createTestApp>>
let owner: TestClient
let secret: string
let codes: string[]
beforeAll(async () => {
  setup = await createTestApp({
    env: { MERRAN_AUTH_TWO_FACTOR: "true", MERRAN_AUTH_PASSKEYS: "true" },
  })
  owner = await setUpServer(setup.app, setup.setupCode)
})
afterAll(() => setup.close())

describe("authenticator lifecycle", () => {
  test("enrollment stays inactive until verified and keeps its secret out of account responses", async () => {
    const response = await owner.post("/api/auth/two-factor/enable", {
      password: TEST_PASSWORD,
    })
    expect(response.status).toBe(200)
    const data = await response.json()
    secret = new URL(data.totpURI).searchParams.get("secret")!
    codes = data.backupCodes
    expect(codes.length).toBeGreaterThan(0)
    const me = await (await owner.get("/api/auth/me")).json()
    expect(me.twoFactorEnabled).toBe(false)
    expect(JSON.stringify(me)).not.toContain(secret)
  })
  test("wrong codes cannot complete enrollment", async () => {
    const response = await owner.post("/api/auth/two-factor/verify-totp", {
      code: "invalid",
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(
      (await (await owner.get("/api/auth/me")).json()).twoFactorEnabled
    ).toBe(false)
  })
  test("a verified code marks the session as strong", async () => {
    const code = authenticatorCode(secret)
    const response = await owner.post("/api/auth/two-factor/verify-totp", {
      code,
    })
    expect(response.status).toBe(200)
    const me = await (await owner.get("/api/auth/me")).json()
    expect(me).toMatchObject({
      twoFactorEnabled: true,
      requiresTwoFactor: false,
    })
    const sessions = await setup.database.em
      .fork()
      .find(Session, { user: me.id })
    expect(sessions.some((s) => s.strongAuthAt instanceof Date)).toBe(true)
  })
  test("password sign-in requires another factor and a recovery code works only once", async () => {
    const me = await (await owner.get("/api/auth/me")).json()
    const browser = new TestClient(setup.app)
    let response = await browser.post("/api/auth/sign-in/email", {
      email: me.email,
      password: TEST_PASSWORD,
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ twoFactorRedirect: true })
    expect((await browser.get("/api/recipes")).status).not.toBe(200)
    response = await browser.post("/api/auth/two-factor/verify-backup-code", {
      code: codes[0],
    })
    expect(response.status).toBe(200)
    expect((await browser.get("/api/recipes")).status).toBe(200)
    response = await browser.post("/api/auth/two-factor/verify-backup-code", {
      code: codes[0],
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
  test("an old session cannot bypass newly enabled two-step policy", async () => {
    const me = await (await owner.get("/api/auth/me")).json()
    await setup.database.em
      .fork()
      .nativeUpdate(Session, { user: me.id }, { strongAuthAt: null })
    expect(
      (await (await owner.get("/api/auth/me")).json()).requiresTwoFactor
    ).toBe(true)
    expect((await owner.get("/api/recipes")).status).toBe(403)
    expect(
      (await owner.post("/api/auth/update-user", { name: "Bypass" })).status
    ).toBe(403)
    expect(
      (
        await owner.post("/api/auth/two-factor/disable", {
          password: TEST_PASSWORD,
        })
      ).status
    ).toBe(403)
    const user = await setup.database.em.fork().findOneOrFail(User, me.id)
    expect(user.name).not.toBe("Bypass")
  })
})

test("passkeys require a secure configured origin", async () => {
  // The test origin is ordinary HTTP, which cannot host WebAuthn.
  expect(
    (await owner.get("/api/auth/passkey/generate-authenticate-options")).status
  ).toBe(403)
})

test("secret rotation preserves authenticators and recovery material", async () => {
  const em = setup.database.em.fork()
  const before = await em.findOneOrFail(TwoFactor, {
    user: { username: "kyle" },
  })
  const key = (secret: string, value: string) => {
    const envelope = parseEnvelope(value)
    return envelope
      ? {
          currentVersion: envelope.version,
          keys: new Map([[envelope.version, secret]]),
          legacySecret: secret,
        }
      : secret
  }
  const original = await symmetricDecrypt({
    key: key(TEST_SECRET, before.secret),
    data: before.secret,
  })
  const next = "another secret long enough for authentication encryption"
  await em.transactional((tx) => rotateAuthSecrets(tx, TEST_SECRET, next))
  await em.transactional((tx) => rotateAuthSecrets(tx, TEST_SECRET, next))
  const after = await setup.database.em
    .fork()
    .findOneOrFail(TwoFactor, { id: before.id })
  expect(
    await symmetricDecrypt({ key: key(next, after.secret), data: after.secret })
  ).toBe(original)
  expect(
    JSON.parse(
      await symmetricDecrypt({
        key: key(next, after.backupCodes),
        data: after.backupCodes,
      })
    )
  ).toContain(codes[1])
  await setup.database.em
    .fork()
    .transactional((tx) => rotateAuthSecrets(tx, next, TEST_SECRET))
})

test("operator recovery revokes existing sessions and permits new enrollment", async () => {
  await resetSecondFactor(setup.database.em.fork(), "kyle")
  expect((await owner.get("/api/auth/me")).status).toBe(401)
  expect(await setup.database.em.fork().count(TwoFactor, {})).toBe(0)
  expect(
    (await setup.database.em.fork().findOneOrFail(User, { username: "kyle" }))
      .twoFactorEnabled
  ).toBe(false)
})
