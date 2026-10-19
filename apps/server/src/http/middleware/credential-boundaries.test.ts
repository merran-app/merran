import { describe, expect, test } from "vitest"
import { Hono } from "hono"
import type { AppEnv } from "../../core/context.ts"
import type { Credential } from "../../services/auth/credentials.ts"
import { handleError } from "../errors.ts"
import { inHousehold, readingHousehold, signedIn } from "./auth.ts"

/** Exercise guards independently of issuance, including a conflicting browser session. */
function guarded(credential: Credential | null) {
  const app = new Hono<AppEnv>()
  app.onError(handleError)
  app.use(async (c, next) => {
    c.set("credential", credential)
    c.set("user", {
      id: "person",
      name: "Person",
      email: "person@example.com",
      username: null,
      displayUsername: null,
      role: "admin",
    })
    // Deliberately keep a cookie session present: a delegated token still wins.
    c.set("session", { id: "browser-session" })
    c.set("apiKey", null)
    c.set("household", { id: "household", role: "owner" })
    await next()
  })
  app.get("/account", (c) => {
    signedIn(c)
    return c.json({ ok: true })
  })
  app.get("/read", (c) =>
    c.json({ areas: readingHousehold(c, ["recipes", "plan"]).readable })
  )
  app.post("/write", (c) => {
    c.set("keyPermission", { area: "recipes", access: "write" })
    inHousehold(c)
    return c.json({ ok: true })
  })
  return app
}

const oauth = {
  kind: "oauth",
  id: "grant",
  clientId: "client",
  name: "Connected app",
  audience: "api",
  permissions: { recipes: "read" },
} as const

describe("credential boundaries", () => {
  test("OAuth cannot become a session even when its user is an administrator", async () => {
    const response = await guarded(oauth).request("/account")
    expect(response.status).toBe(403)
  })

  test("a missing credential cannot borrow an attached session", async () => {
    expect((await guarded(null).request("/account")).status).toBe(401)
  })

  test("an explicit session can use account routes", async () => {
    expect(
      (
        await guarded({ kind: "session", id: "browser-session" }).request(
          "/account"
        )
      ).status
    ).toBe(200)
  })

  test("REST readers see only granted areas", async () => {
    const response = await guarded(oauth).request("/read")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ areas: ["recipes"] })
  })

  test("a read token cannot write", async () => {
    expect(
      (await guarded(oauth).request("/write", { method: "POST" })).status
    ).toBe(403)
  })

  test("an MCP token cannot read or write the REST API, regardless of scopes", async () => {
    const app = guarded({
      ...oauth,
      audience: "mcp",
      permissions: { recipes: "write" },
    })
    expect((await app.request("/read")).status).toBe(403)
    expect((await app.request("/write", { method: "POST" })).status).toBe(403)
  })

  test("API keys remain restricted to their grants", async () => {
    const app = guarded({
      kind: "apiKey",
      id: "key",
      name: "Script",
      permissions: { recipes: "read" },
    })
    expect((await app.request("/account")).status).toBe(403)
    expect((await app.request("/write", { method: "POST" })).status).toBe(403)
    expect(await (await app.request("/read")).json()).toEqual({
      areas: ["recipes"],
    })
  })
})
