import { afterAll, beforeAll, beforeEach, expect, test } from "vitest"
import { createHash, randomBytes } from "node:crypto"
import { createTestApp, account, TestClient } from "../../test/app.ts"
import {
  HouseholdMember,
  OauthAccessToken,
  OauthClient,
  User,
  RateLimit,
} from "../../database/entities/index.ts"
import { tokenHash, OAUTH_PREFIX } from "../../services/auth/oauth/provider.ts"
import { forHousehold } from "../../database/scope.ts"

let setup: Awaited<ReturnType<typeof createTestApp>>
const TEST_ORIGIN = "https://merran.test"
class Browser extends TestClient {
  override headers() {
    const headers = super.headers()
    headers.set("origin", TEST_ORIGIN)
    return headers
  }
}
let owner: Browser
beforeAll(async () => {
  setup = await createTestApp({
    publicUrl: TEST_ORIGIN,
    env: { MERRAN_AUTH_OAUTH: "true" },
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
afterAll(() => setup.close())
beforeEach(async () => {
  // Each scenario gets its own request budget; production limits remain enabled.
  await setup.database.em.fork().nativeDelete(RateLimit, {})
})

test.each(["mcp", "api"])(
  "OAuth %s: PKCE consent, refresh, audience separation and revocation",
  async (audience) => {
    const metadata = await setup.app.request(
      TEST_ORIGIN + "/.well-known/oauth-protected-resource/mcp"
    )
    expect(metadata.status).toBe(200)
    expect(await metadata.json()).toMatchObject({
      resource: TEST_ORIGIN + "/mcp",
    })
    const discovery = await setup.app.request(
      TEST_ORIGIN + "/.well-known/oauth-authorization-server/api/auth"
    )
    expect(discovery.status).toBe(200)
    expect(await discovery.json()).toMatchObject({
      issuer: TEST_ORIGIN + "/api/auth",
      grant_types_supported: ["authorization_code", "refresh_token"],
    })
    const registered = await owner.post("/api/auth/oauth2/register", {
      client_name: "Test kitchen",
      redirect_uris: ["https://client.example.com/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "recipes:read offline_access",
      resources: [TEST_ORIGIN + "/" + audience],
    })
    const client = await registered.json()
    expect(registered.status, JSON.stringify(client)).toBe(201)
    const verifier = randomBytes(32).toString("base64url")
    const query = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: "https://client.example.com/callback",
      response_type: "code",
      scope: "recipes:read offline_access",
      state: "test-state",
      resource: TEST_ORIGIN + "/" + audience,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    })
    const authorization = await owner.get("/api/auth/oauth2/authorize?" + query)
    expect(authorization.status, await authorization.clone().text()).toBe(302)
    const householdPage = new URL(
      authorization.headers.get("location")!,
      TEST_ORIGIN
    )
    const me = await (await owner.get("/api/auth/me")).json()
    const householdId = me.activeHouseholdId
    const continued = await owner.post("/api/auth/oauth2/continue", {
      postLogin: true,
      oauth_query: householdPage.search.slice(1),
      householdId,
    })
    const next = await continued.json()
    expect(
      continued.status,
      JSON.stringify({ next, location: householdPage.href })
    ).toBe(200)
    const consentPage = new URL(next.url ?? next.redirect_uri, TEST_ORIGIN)
    expect(
      (
        await owner.post("/api/auth/oauth2/consent", {
          accept: true,
          oauth_query: consentPage.search.slice(1),
          householdId: "not-my-household",
        })
      ).status
    ).toBe(403)
    const consent = await owner.post("/api/auth/oauth2/consent", {
      accept: true,
      oauth_query: consentPage.search.slice(1),
      householdId,
    })
    const approved = await consent.json()
    expect(consent.status, JSON.stringify(approved)).toBe(200)
    expect(
      approved.url ?? approved.redirect_uri,
      JSON.stringify(approved)
    ).toBeTruthy()
    expect(
      approved.url ?? approved.redirect_uri,
      JSON.stringify(approved)
    ).toMatch(/^https:\/\/client.example.com\//)
    const callback = new URL(approved.url ?? approved.redirect_uri, TEST_ORIGIN)
    expect(callback.searchParams.get("state")).toBe("test-state")
    const exchanged = await owner.send("POST", "/api/auth/oauth2/token", {
      type: "application/x-www-form-urlencoded",
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: callback.searchParams.get("code")!,
        redirect_uri: "https://client.example.com/callback",
        client_id: client.client_id,
        code_verifier: verifier,
        resource: TEST_ORIGIN + "/" + audience,
      }).toString(),
    })
    let tokens = await exchanged.json()
    expect(exchanged.status, JSON.stringify(tokens)).toBe(200)
    expect(tokens.access_token).toMatch(/^mro_/)
    const rest = await setup.app.request(TEST_ORIGIN + "/api/recipes", {
      headers: { authorization: "Bearer " + tokens.access_token },
    })
    expect(rest.status, await rest.clone().text()).toBe(
      audience === "mcp" ? 403 : 200
    )
    const mcp = await setup.app.request(TEST_ORIGIN + "/mcp", {
      method: "POST",
      headers: {
        authorization: "Bearer " + tokens.access_token,
        "Content-Type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    })
    expect(mcp.status, await mcp.clone().text()).toBe(
      audience === "mcp" ? 200 : 403
    )
    const refreshed = await owner.send("POST", "/api/auth/oauth2/token", {
      type: "application/x-www-form-urlencoded",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: client.client_id,
        resource: TEST_ORIGIN + "/" + audience,
      }).toString(),
    })
    const rotated = await refreshed.json()
    expect(refreshed.status, JSON.stringify(rotated)).toBe(200)
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token)
    const reused = await owner.send("POST", "/api/auth/oauth2/token", {
      type: "application/x-www-form-urlencoded",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: client.client_id,
      }).toString(),
    })
    expect(reused.status).toBe(400)
    tokens = rotated
    const grants = await (
      await owner.get("/api/auth/oauth2/get-consents")
    ).json()
    expect(grants).toHaveLength(1)
    const crossSiteHeaders = owner.headers()
    crossSiteHeaders.set("origin", "https://other.example.com")
    crossSiteHeaders.set("content-type", "application/json")
    const crossSiteRemoval = await setup.app.request(
      TEST_ORIGIN + "/api/auth/oauth2/delete-consent",
      {
        method: "POST",
        headers: crossSiteHeaders,
        body: JSON.stringify({ id: grants[0].id }),
      }
    )
    expect(crossSiteRemoval.status).toBe(403)
    expect(
      (
        await owner.post("/api/auth/oauth2/delete-consent", {
          id: grants[0].id,
        })
      ).status
    ).toBe(200)
    const revoked = await setup.app.request(TEST_ORIGIN + "/api/recipes", {
      headers: { authorization: "Bearer " + tokens.access_token },
    })
    expect(revoked.status).toBe(401)
    const revokedRefresh = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: client.client_id,
      resource: TEST_ORIGIN + "/" + audience,
    })
    expect(revokedRefresh.status).toBe(400)
  }
)

test("rejects missing PKCE, unknown resources and identity or machine grants", async () => {
  const authorization = "/api/auth/oauth2/authorize?"
  expect(
    (
      await owner.get(
        authorization + new URLSearchParams({ resource: TEST_ORIGIN + "/mcp" })
      )
    ).status
  ).toBe(400)
  expect(
    (
      await owner.get(
        authorization +
          new URLSearchParams({
            resource: "https://another.example.com/mcp",
            code_challenge: "x",
            code_challenge_method: "S256",
          })
      )
    ).status
  ).toBe(400)
  for (const grant_types of [["client_credentials"], ["implicit"]]) {
    expect(
      (
        await owner.post("/api/auth/oauth2/register", {
          client_name: "Unsupported",
          redirect_uris: ["https://client.example.com/callback"],
          grant_types,
        })
      ).status
    ).toBe(400)
  }
  expect(
    (
      await owner.post("/api/auth/oauth2/register", {
        client_name: "Identity",
        redirect_uris: ["https://client.example.com/callback"],
        scope: "openid profile email",
      })
    ).status
  ).toBe(400)
})

test("administrator registration and client removal never disclose stored secrets", async () => {
  const created = await owner.post("/api/auth/oauth2/create-client", {
    client_name: "REST kitchen",
    redirect_uris: ["https://client.example.com/callback"],
    token_endpoint_auth_method: "client_secret_basic",
    grant_types: ["authorization_code", "refresh_token"],
    resources: [TEST_ORIGIN + "/api"],
  })
  const client = await created.json()
  expect(created.status, JSON.stringify(client)).toBe(201)
  expect(client.client_secret).toBeTruthy()
  const listing = await (await owner.get("/api/auth/oauth-clients")).json()
  expect(JSON.stringify(listing)).not.toContain(client.client_secret)
  expect(
    (await owner.delete("/api/auth/oauth-clients/" + client.client_id)).status
  ).toBe(204)
})

/** Exercise browser consent separately from the client's token exchange. */
async function pendingConsent() {
  const registered = await owner.post("/api/auth/oauth2/register", {
    client_name: "Boundary checks",
    redirect_uris: ["https://client.example.com/callback"],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    scope: "recipes:read offline_access",
    resources: [TEST_ORIGIN + "/api"],
  })
  expect(registered.status).toBe(201)
  const client = await registered.json()
  const verifier = randomBytes(32).toString("base64url")
  const query = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: "https://client.example.com/callback",
    response_type: "code",
    scope: "recipes:read offline_access",
    state: "boundary-state",
    resource: TEST_ORIGIN + "/api",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  })
  const authorization = await owner.get("/api/auth/oauth2/authorize?" + query)
  expect(authorization.status).toBe(302)
  const householdPage = new URL(
    authorization.headers.get("location")!,
    TEST_ORIGIN
  )
  const me = await (await owner.get("/api/auth/me")).json()
  const continued = await owner.post("/api/auth/oauth2/continue", {
    postLogin: true,
    oauth_query: householdPage.search.slice(1),
    householdId: me.activeHouseholdId,
  })
  expect(continued.status).toBe(200)
  const next = await continued.json()
  const consentPage = new URL(next.url, TEST_ORIGIN)
  return {
    clientId: client.client_id as string,
    verifier,
    householdId: me.activeHouseholdId as string,
    userId: me.id as string,
    consentQuery: consentPage.search.slice(1),
  }
}

async function approvedCode() {
  const pending = await pendingConsent()
  const response = await owner.post("/api/auth/oauth2/consent", {
    accept: true,
    oauth_query: pending.consentQuery,
    householdId: pending.householdId,
  })
  expect(response.status).toBe(200)
  const approved = await response.json()
  const callback = new URL(approved.url)
  return {
    ...pending,
    exchange: {
      grant_type: "authorization_code",
      code: callback.searchParams.get("code")!,
      redirect_uri: "https://client.example.com/callback",
      client_id: pending.clientId,
      code_verifier: pending.verifier,
      resource: TEST_ORIGIN + "/api",
    },
  }
}

function exchangeToken(fields: Record<string, string>) {
  return owner.send("POST", "/api/auth/oauth2/token", {
    type: "application/x-www-form-urlencoded",
    body: new URLSearchParams(fields).toString(),
  })
}

test("consent rejects modified signed permissions and refusal issues no code", async () => {
  const pending = await pendingConsent()
  const tampered = new URLSearchParams(pending.consentQuery)
  tampered.set("scope", "recipes:write offline_access")
  const altered = await owner.post("/api/auth/oauth2/consent", {
    accept: true,
    oauth_query: tampered.toString(),
    householdId: pending.householdId,
  })
  expect(altered.status).toBeGreaterThanOrEqual(400)

  const denied = await owner.post("/api/auth/oauth2/consent", {
    accept: false,
    oauth_query: pending.consentQuery,
    householdId: pending.householdId,
  })
  expect(denied.status).toBe(200)
  const callback = new URL((await denied.json()).url)
  expect(callback.searchParams.get("error")).toBe("access_denied")
  expect(callback.searchParams.has("code")).toBe(false)
  expect(callback.searchParams.get("state")).toBe("boundary-state")
})

test.each([
  { code_verifier: "wrong-verifier" },
  { redirect_uri: "https://other.example.com/callback" },
  { resource: TEST_ORIGIN + "/mcp" },
])("code exchange refuses changed binding: %j", async (override) => {
  const approved = await approvedCode()
  const response = await exchangeToken({ ...approved.exchange, ...override })
  expect(response.status).toBeGreaterThanOrEqual(400)
  expect(await response.json()).not.toHaveProperty("access_token")
})

test("authorization codes are single-use and refresh cannot widen scopes", async () => {
  const approved = await approvedCode()
  const exchanged = await exchangeToken(approved.exchange)
  expect(exchanged.status).toBe(200)
  const tokens = await exchanged.json()
  const widened = await exchangeToken({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: approved.clientId,
    scope: "recipes:write offline_access",
    resource: TEST_ORIGIN + "/api",
  })
  expect(widened.status).toBe(400)
  const replay = await exchangeToken(approved.exchange)
  expect(replay.status).toBe(400)
})

test("disconnect immediately invalidates a working access and refresh token", async () => {
  const approved = await approvedCode()
  const exchanged = await exchangeToken(approved.exchange)
  expect(exchanged.status).toBe(200)
  const tokens = await exchanged.json()
  const request = () =>
    setup.app.request(TEST_ORIGIN + "/api/recipes", {
      headers: { authorization: "Bearer " + tokens.access_token },
    })
  expect((await request()).status).toBe(200)
  const grants = await (await owner.get("/api/auth/oauth2/get-consents")).json()
  const grant = grants.find(
    (entry: { clientId: string }) => entry.clientId === approved.clientId
  )
  expect(grant).toBeDefined()
  expect(
    (await owner.post("/api/auth/oauth2/delete-consent", { id: grant.id }))
      .status
  ).toBe(200)
  expect((await request()).status).toBe(401)
  const refreshed = await exchangeToken({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: approved.clientId,
    resource: TEST_ORIGIN + "/api",
  })
  expect(refreshed.status).toBe(400)
})

test("access rechecks expiry, client, account and household membership", async () => {
  const approved = await approvedCode()
  const exchanged = await exchangeToken(approved.exchange)
  expect(exchanged.status).toBe(200)
  const tokens = await exchanged.json()
  const em = setup.database.em.fork()
  const access = await em.findOneOrFail(OauthAccessToken, {
    token: tokenHash(tokens.access_token.slice(OAUTH_PREFIX.length)),
  })
  const readRecipes = () =>
    setup.app.request(TEST_ORIGIN + "/api/recipes", {
      headers: { authorization: "Bearer " + tokens.access_token },
    })
  expect((await readRecipes()).status).toBe(200)
  await em.nativeUpdate(
    OauthAccessToken,
    { id: access.id },
    { expiresAt: new Date(0) }
  )
  expect((await readRecipes()).status).toBe(401)
  await em.nativeUpdate(
    OauthAccessToken,
    { id: access.id },
    { expiresAt: access.expiresAt }
  )
  await em.nativeUpdate(
    OauthClient,
    { clientId: approved.clientId },
    { disabled: true }
  )
  expect((await readRecipes()).status).toBe(401)
  await em.nativeUpdate(
    OauthClient,
    { clientId: approved.clientId },
    { disabled: false }
  )
  await em.nativeUpdate(User, { id: approved.userId }, { banned: true })
  expect((await readRecipes()).status).toBe(401)
  await em.nativeUpdate(User, { id: approved.userId }, { banned: false })
  expect((await readRecipes()).status).toBe(200)
  await forHousehold(em, approved.householdId).nativeDelete(HouseholdMember, {
    household: approved.householdId,
    user: approved.userId,
  })
  expect((await readRecipes()).status).toBe(401)
})
