import { afterAll, beforeAll, expect, test } from "vitest"
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto"
import { createTestApp, account, TestClient } from "../../test/app.ts"
import { Passkey } from "../../database/entities/index.ts"

const origin = "https://merran.test"
class Browser extends TestClient {
  override headers() {
    const headers = super.headers()
    headers.set("origin", origin)
    return headers
  }
}
// Minimal CBOR for an independent virtual authenticator's none-attestation and COSE key.
function cbor(value: number | string | Buffer | Map<unknown, unknown>): Buffer {
  const head = (type: number, length: number) =>
    length < 24
      ? Buffer.from([(type << 5) | length])
      : length < 256
        ? Buffer.from([(type << 5) | 24, length])
        : Buffer.from([(type << 5) | 25, length >> 8, length & 255])
  if (typeof value === "number")
    return value < 0 ? head(1, -1 - value) : head(0, value)
  if (typeof value === "string") {
    const text = Buffer.from(value)
    return Buffer.concat([head(3, text.length), text])
  }
  if (Buffer.isBuffer(value))
    return Buffer.concat([head(2, value.length), value])
  return Buffer.concat([
    head(5, value.size),
    ...[...value].flatMap(([key, entry]) => [
      cbor(key as number | string),
      cbor(entry as Buffer | number | Map<unknown, unknown>),
    ]),
  ])
}
const sha = (data: string | Buffer) =>
  createHash("sha256").update(data).digest()
const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
const jwk = key.publicKey.export({ format: "jwk" })
const credential = randomBytes(32)
const credentialId = credential.toString("base64url")
const publicKey = cbor(
  new Map<unknown, unknown>([
    [1, 2],
    [3, -7],
    [-1, 1],
    [-2, Buffer.from(jwk.x!, "base64url")],
    [-3, Buffer.from(jwk.y!, "base64url")],
  ])
)
const clientData = (type: string, challenge: string, suppliedOrigin = origin) =>
  Buffer.from(
    JSON.stringify({
      type,
      challenge,
      origin: suppliedOrigin,
      crossOrigin: false,
    })
  )
let setup: Awaited<ReturnType<typeof createTestApp>>
let owner: Browser
beforeAll(async () => {
  setup = await createTestApp({
    publicUrl: origin,
    env: {
      MERRAN_AUTH_PASSKEYS: "true",
      MERRAN_AUTH_REQUIRE_ADMIN_TWO_FACTOR: "true",
      MERRAN_AUTH_PASSWORDS: "false",
    },
  })
  owner = new Browser(setup.app)
  expect(
    (
      await owner.post("/api/auth/setup", {
        ...account("kyle"),
        code: setup.setupCode.issue(),
        household: "Home",
      })
    ).status
  ).toBe(201)
})
afterAll(() => setup?.close())

test("register a user-verified passkey and reject replayed challenges", async () => {
  const options = await (
    await owner.get("/api/auth/passkey/generate-register-options")
  ).json()
  const length = Buffer.alloc(2)
  length.writeUInt16BE(credential.length)
  const authData = Buffer.concat([
    sha("merran.test"),
    Buffer.from([0x45]),
    Buffer.alloc(4),
    Buffer.alloc(16),
    length,
    credential,
    publicKey,
  ])
  const response = {
    id: credentialId,
    rawId: credentialId,
    type: "public-key",
    clientExtensionResults: {},
    authenticatorAttachment: "platform",
    response: {
      clientDataJSON: clientData("webauthn.create", options.challenge).toString(
        "base64url"
      ),
      attestationObject: cbor(
        new Map<unknown, unknown>([
          ["fmt", "none"],
          ["authData", authData],
          ["attStmt", new Map()],
        ])
      ).toString("base64url"),
      transports: ["internal"],
    },
  }
  const registered = await owner.post("/api/auth/passkey/verify-registration", {
    name: "Test authenticator",
    response,
  })
  expect(registered.status, await registered.clone().text()).toBe(200)
  expect(
    (await owner.post("/api/auth/passkey/verify-registration", { response }))
      .status
  ).toBeGreaterThanOrEqual(400)
})

async function authenticate(verified: boolean, suppliedOrigin = origin) {
  const browser = new Browser(setup.app)
  const options = await (
    await browser.get("/api/auth/passkey/generate-authenticate-options")
  ).json()
  const counter = Buffer.alloc(4)
  counter.writeUInt32BE(1)
  const authData = Buffer.concat([
    sha("merran.test"),
    Buffer.from([verified ? 5 : 1]),
    counter,
  ])
  const data = clientData("webauthn.get", options.challenge, suppliedOrigin)
  const signature = sign(
    "sha256",
    Buffer.concat([authData, sha(data)]),
    key.privateKey
  )
  const response = await browser.post(
    "/api/auth/passkey/verify-authentication",
    {
      response: {
        id: credentialId,
        rawId: credentialId,
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: data.toString("base64url"),
          authenticatorData: authData.toString("base64url"),
          signature: signature.toString("base64url"),
        },
      },
    }
  )
  return { browser, response }
}
test("a signed assertion without user verification cannot satisfy strong sign-in", async () => {
  const { browser, response } = await authenticate(false)
  expect(response.status).toBeGreaterThanOrEqual(400)
  expect((await browser.get("/api/auth/me")).status).toBe(401)
})
test("an assertion from another origin is rejected", async () => {
  const { browser, response } = await authenticate(
    true,
    "https://evil.example.com"
  )
  expect(response.status).toBeGreaterThanOrEqual(400)
  expect((await browser.get("/api/auth/me")).status).toBe(401)
})
test("a valid verified passkey satisfies administrator policy", async () => {
  const { browser, response } = await authenticate(true)
  expect(response.status, await response.clone().text()).toBe(200)
  const me = await (await browser.get("/api/auth/me")).json()
  expect(me).toMatchObject({ serverAdmin: true, requiresTwoFactor: false })
  expect((await browser.get("/api/recipes")).status).toBe(200)
  const passkeys = await (
    await browser.get("/api/auth/passkey/list-user-passkeys")
  ).json()
  expect(
    (
      await browser.post("/api/auth/passkey/delete-passkey", {
        id: passkeys[0].id,
      })
    ).status
  ).toBe(403)
  expect(
    (
      await new Browser(setup.app).post("/api/auth/sign-in/email", {
        email: "kyle@example.com",
        password: account("kyle").password,
      })
    ).status
  ).toBe(403)

  // Two separate requests must not each treat the other's key as a fallback.
  const em = setup.database.em.fork()
  const existing = await em.findOneOrFail(Passkey, { id: passkeys[0].id })
  const spare = em.create(Passkey, {
    user: me.id,
    publicKey: existing.publicKey,
    credentialID: randomBytes(32).toString("base64url"),
    counter: 0,
    deviceType: "singleDevice",
    backedUp: false,
  })
  await em.flush()
  const removals = await Promise.all([
    browser.post("/api/auth/passkey/delete-passkey", { id: existing.id }),
    browser.post("/api/auth/passkey/delete-passkey", { id: spare.id }),
  ])
  expect(removals.map((result) => result.status).sort()).toEqual([200, 403])
  expect(await em.count(Passkey, { user: me.id })).toBe(1)
})
