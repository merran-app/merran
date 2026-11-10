import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import { User } from "../../../../../database/entities/index.ts"
import type { Database } from "../../../../../database/orm.ts"
import { createOpenApiFile } from "../../../../openapi/file.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
} from "../../../../../test/app.ts"

// The language each person sees Merran in: theirs alone, on every device,
// and only one Merran has. Kyle set the server up; Sam joined his household.

let app: App
let database: Database
let close: () => Promise<void>
let kyle: TestClient
let sam: TestClient
let kyleId: string

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, database, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  sam = await join(app, await inviteToken(kyle), account("sam", "Sam"))
  kyleId = (await (await kyle.get("/api/auth/me")).json()).id
})

afterAll(() => close())

const me = async (who: TestClient) => (await who.get("/api/auth/me")).json()
const choose = (language: unknown) =>
  kyle.patch("/api/auth/me/language", { language })

/** Kyle's preferences as stored, or set to these. */
async function preferences(set?: Record<string, unknown>) {
  const em = database.em.fork()
  const person = await em.findOneOrFail(User, kyleId)
  if (set) {
    person.preferences = set as never
    await em.flush()
  }
  return person.preferences
}

describe("a person's language", () => {
  test("follows the browser until chosen", async () => {
    expect((await me(kyle)).language).toBeNull()
  })

  test("saves a language, and gives it back with the person", async () => {
    const res = await choose("en")
    expect(res.status, await res.clone().text()).toBe(200)
    expect((await res.json()).language).toBe("en")
    expect((await me(kyle)).language).toBe("en")
    expect((await me(sam)).language).toBeNull()
  })

  test("null goes back to the browser, keeping other preferences", async () => {
    await preferences({ units: "metric", language: "en" })
    const res = await choose(null)
    expect(res.status, await res.clone().text()).toBe(200)
    expect((await res.json()).language).toBeNull()
    expect(await preferences()).toEqual({ units: "metric" })
  })

  test("is described as a string, so adding a language changes no generated file", async () => {
    const document = JSON.parse(await createOpenApiFile()) as {
      components: {
        schemas: Record<
          string,
          { properties: Record<string, { enum?: unknown }> }
        >
      }
    }
    const { Me, LanguageChoice } = document.components.schemas
    expect(Me!.properties.language!.enum).toBeUndefined()
    expect(LanguageChoice!.properties.language!.enum).toBeUndefined()
  })

  test("takes only Merran's languages", async () => {
    expect((await choose("xx")).status).toBe(400)
    expect((await choose("")).status).toBe(400)
    expect((await kyle.patch("/api/auth/me/language", {})).status).toBe(400)
  })

  test("reads a language Merran no longer has as none", async () => {
    await preferences({ language: "tlh" })
    const res = await kyle.get("/api/auth/me")
    expect(res.status, await res.clone().text()).toBe(200)
    expect((await res.json()).language).toBeNull()
  })

  test("is the signed-in person's, not an API key's", async () => {
    const key = (
      await (
        await kyle.post("/api/auth/api-keys", {
          name: "Everything",
          permissions: { recipes: "write", plan: "write" },
          expiresInDays: 30,
        })
      ).json()
    ).key
    const withKey = await app.request(`${TEST_ORIGIN}/api/auth/me/language`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ language: "en" }),
    })
    expect(withKey.status).toBe(403)
    const refused = (await withKey.json()) as { error: { code: string } }
    expect(refused.error.code).toBe("api_key_not_allowed")

    const signedOut = await app.request(`${TEST_ORIGIN}/api/auth/me/language`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: TEST_ORIGIN },
      body: JSON.stringify({ language: "en" }),
    })
    expect(signedOut.status).toBe(401)
  })
})
