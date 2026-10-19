import { afterAll, beforeAll, expect, test, vi } from "vitest"
import { generateKeyPairSync, sign } from "node:crypto"
import {
  createTestApp,
  setUpServer,
  TestClient,
  TEST_ORIGIN,
} from "../../test/app.ts"
import { Account } from "../../database/entities/index.ts"

const issuer = "https://identity.example.com"
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 })
const jwk = {
  ...keys.publicKey.export({ format: "jwk" }),
  kid: "test-key",
  alg: "RS256",
  use: "sig",
}
let nonce: string | null = null
let wrongNonce = false
const jwt = () => {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: "test-key", typ: "JWT" })
  ).toString("base64url")
  const payload = Buffer.from(
    JSON.stringify({
      iss: issuer,
      aud: "merran",
      sub: "external-kyle",
      email: "kyle@example.com",
      email_verified: true,
      name: "External Kyle",
      iat: now,
      exp: now + 300,
      nonce: wrongNonce ? "wrong-nonce" : nonce,
      acr: "urn:example:strong",
    })
  ).toString("base64url")
  const input = header + "." + payload
  return (
    input +
    "." +
    sign("sha256", Buffer.from(input), keys.privateKey).toString("base64url")
  )
}
let setup: Awaited<ReturnType<typeof createTestApp>>
let owner: TestClient
beforeAll(async () => {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    if (url === issuer + "/.well-known/openid-configuration")
      return Response.json({
        issuer,
        authorization_endpoint: issuer + "/authorize",
        token_endpoint: issuer + "/token",
        jwks_uri: issuer + "/jwks",
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
      })
    if (url === issuer + "/token")
      return Response.json({
        access_token: "external-access",
        token_type: "Bearer",
        expires_in: 300,
        id_token: jwt(),
      })
    if (url === issuer + "/jwks") return Response.json({ keys: [jwk] })
    throw new Error("Unexpected provider request")
  })
  setup = await createTestApp({
    env: {
      MERRAN_AUTH_OIDC_DISCOVERY: issuer + "/.well-known/openid-configuration",
      MERRAN_AUTH_OIDC_CLIENT_ID: "merran",
      MERRAN_AUTH_OIDC_CLIENT_SECRET: "test-client-secret",
    },
  })
  owner = await setUpServer(setup.app, setup.setupCode)
})
afterAll(async () => {
  vi.unstubAllGlobals()
  await setup?.close()
})

async function begin(browser: TestClient, link = false) {
  const response = await browser.post(
    "/api/auth/" + (link ? "link-social" : "sign-in/social"),
    { provider: "oidc", callbackURL: TEST_ORIGIN + "/settings/you" }
  )
  const data = await response.json()
  expect(response.status, JSON.stringify(data)).toBe(200)
  const url = new URL(data.url)
  expect(url.searchParams.get("code_challenge_method")).toBe("S256")
  nonce = url.searchParams.get("nonce")
  expect(nonce).toBeTruthy()
  return url.searchParams.get("state")!
}
async function callback(browser: TestClient, state: string) {
  return browser.get(
    "/api/auth/callback/oidc?" +
      new URLSearchParams({ state, code: "test-code" })
  )
}

test("matching email does not silently link an external identity", async () => {
  const browser = new TestClient(setup.app)
  await callback(browser, await begin(browser))
  expect((await browser.get("/api/auth/me")).status).toBe(401)
  expect(
    await setup.database.em.fork().count(Account, { providerId: "oidc" })
  ).toBe(0)
})
test("linking requires a valid state and nonce", async () => {
  const state = await begin(owner, true)
  await callback(owner, state + "tampered")
  expect(
    await setup.database.em.fork().count(Account, { providerId: "oidc" })
  ).toBe(0)
  wrongNonce = true
  await callback(owner, await begin(owner, true))
  wrongNonce = false
  expect(
    await setup.database.em.fork().count(Account, { providerId: "oidc" })
  ).toBe(0)
})
test("explicit linking works and external assurance cannot bypass administrator policy", async () => {
  const result = await callback(owner, await begin(owner, true))
  expect(result.status).toBe(302)
  expect(
    await setup.database.em.fork().count(Account, { providerId: "oidc" })
  ).toBe(1)
  expect(
    (
      await owner.patch("/api/settings/server", {
        "auth.requireAdminTwoFactor": true,
      })
    ).status
  ).toBe(200)
  const browser = new TestClient(setup.app)
  await callback(browser, await begin(browser))
  const me = await (await browser.get("/api/auth/me")).json()
  expect(me).toMatchObject({ requiresTwoFactor: true, serverAdmin: true })
  expect((await browser.get("/api/recipes")).status).toBe(403)
})
