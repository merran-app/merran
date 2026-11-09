import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import { Household } from "../../../../../database/entities/index.ts"
import type { Database } from "../../../../../database/orm.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../../../test/app.ts"

let app: App
let database: Database
let close: () => Promise<void>
let owner: TestClient
let member: TestClient

beforeAll(async () => {
  const testApp = await createTestApp({ publicUrl: "http://merran.test" })
  ;({ app, database, close } = testApp)
  owner = await setUpServer(app, testApp.setupCode)
  member = await join(app, await inviteToken(owner), account("share_member"))
})

afterAll(() => close())

async function makeRecipe(name: string) {
  const res = await owner.post("/api/recipes", {
    name,
    servings: 2,
    ingredients: ["1 lemon"],
    steps: ["Cook it."],
  })
  expect(res.status).toBe(201)
  return (await res.json()).slug as string
}

const shareUrlOf = (slug: string) => `/api/recipes/${slug}/share`

describe("sharing a recipe by link", () => {
  test("a member shares a recipe and gets the same link again", async () => {
    const slug = await makeRecipe("Shared Soup")

    const first = await member.post(shareUrlOf(slug))
    expect(first.status).toBe(200)
    const { url, createdAt } = await first.json()
    expect(url).toMatch(/^http:\/\/merran\.test\/r\/[A-Za-z0-9_-]{43}$/)

    const again = await member.post(shareUrlOf(slug))
    expect((await again.json()).url).toBe(url)

    const seen = await member.get(shareUrlOf(slug))
    expect(await seen.json()).toEqual({ share: { url, createdAt } })
  })

  test("a double-tap makes one link", async () => {
    const slug = await makeRecipe("Double Tap Stew")
    const [one, two] = await Promise.all([
      owner.post(shareUrlOf(slug)),
      owner.post(shareUrlOf(slug)),
    ])
    expect(one.status).toBe(200)
    expect(two.status).toBe(200)
    expect((await one.json()).url).toBe((await two.json()).url)
  })

  test("stop sharing, then sharing again, makes a new link", async () => {
    const slug = await makeRecipe("Stopped Salad")
    const { url } = await (await owner.post(shareUrlOf(slug))).json()

    expect((await owner.delete(shareUrlOf(slug))).status).toBe(204)
    expect(await (await owner.get(shareUrlOf(slug))).json()).toEqual({
      share: null,
    })

    const next = await (await owner.post(shareUrlOf(slug))).json()
    expect(next.url).not.toBe(url)
  })

  test("another household can't share or see this recipe's link", async () => {
    const slug = await makeRecipe("Private Pie")
    const home = await (await owner.get("/api/households/current")).json()
    await owner.post(shareUrlOf(slug))

    const other = await owner.post("/api/households", { name: "Other" })
    expect(other.status).toBe(201)
    try {
      expect((await owner.get(shareUrlOf(slug))).status).toBe(404)
      expect((await owner.post(shareUrlOf(slug))).status).toBe(404)
    } finally {
      await owner.post("/api/auth/organization/set-active", {
        organizationId: home.id,
      })
    }
  })

  test("sharing is refused while the household has it off", async () => {
    const slug = await makeRecipe("Off Omelette")
    const home = await (await owner.get("/api/households/current")).json()
    const em = database.em.fork()
    const household = await em.findOneOrFail(Household, home.id)
    household.settings = { ...household.settings, sharing: { recipes: false } }
    await em.flush()

    try {
      const refused = await member.post(shareUrlOf(slug))
      expect(refused.status).toBe(403)
      expect((await refused.json()).error.code).toBe("sharing_off")
    } finally {
      household.settings = { ...household.settings, sharing: { recipes: true } }
      await em.flush()
    }
  })

  test("a share outlives the member who made it", async () => {
    const slug = await makeRecipe("Lasting Lasagna")
    const { url } = await (await member.post(shareUrlOf(slug))).json()

    const members = await (
      await owner.get("/api/households/current/members")
    ).json()
    const memberId = members.find(
      (one: { name: string }) => one.name === "share_member"
    ).id
    const removed = await owner.delete(
      `/api/households/current/members/${memberId}`
    )
    expect(removed.status).toBeLessThan(300)

    const seen = await owner.get(shareUrlOf(slug))
    expect((await seen.json()).share.url).toBe(url)
  })
})

describe("without a public URL", () => {
  test("sharing explains why", async () => {
    const testApp = await createTestApp({ publicUrl: null })
    try {
      const client = await setUpServer(testApp.app, testApp.setupCode)
      const recipe = await (
        await client.post("/api/recipes", { name: "Unlinked Toast" })
      ).json()

      const refused = await client.post(shareUrlOf(recipe.slug))
      expect(refused.status).toBe(400)
      expect((await refused.json()).error.code).toBe("share_public_url")
    } finally {
      await testApp.close()
    }
  })
})
