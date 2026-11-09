import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../../../test/app.ts"

let app: App
let close: () => Promise<void>
let owner: TestClient
let member: TestClient

beforeAll(async () => {
  const testApp = await createTestApp({ publicUrl: "http://merran.test" })
  ;({ app, close } = testApp)
  owner = await setUpServer(app, testApp.setupCode)
  member = await join(app, await inviteToken(owner), account("list_member"))
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

describe("the household's sharing switch", () => {
  test("an admin turns sharing off and on, and links pause rather than end", async () => {
    const slug = await makeRecipe("Paused Pancakes")
    const { url } = await (await owner.post(shareUrlOf(slug))).json()

    const off = await owner.patch("/api/households/current", {
      recipeSharing: false,
    })
    expect(off.status).toBe(200)
    expect((await off.json()).recipeSharing).toBe(false)

    const on = await owner.patch("/api/households/current", {
      recipeSharing: true,
    })
    expect((await on.json()).recipeSharing).toBe(true)

    const seen = await owner.get(shareUrlOf(slug))
    expect((await seen.json()).share.url).toBe(url)
  })

  test("members can't change the switch or read the list", async () => {
    const change = await member.patch("/api/households/current", {
      recipeSharing: false,
    })
    expect(change.status).toBe(403)

    const list = await member.get("/api/households/current/shares")
    expect(list.status).toBe(403)
  })
})

describe("the admin's list of shared recipes", () => {
  test("says who shared what, newest first", async () => {
    const byMember = await makeRecipe("Member's Mousse")
    const byOwner = await makeRecipe("Owner's Okra")
    await member.post(shareUrlOf(byMember))
    // The list sorts by time, so keep the two shares apart.
    await new Promise((resolve) => setTimeout(resolve, 20))
    const { url } = await (await owner.post(shareUrlOf(byOwner))).json()

    const res = await owner.get("/api/households/current/shares")
    expect(res.status).toBe(200)
    const { shares } = await res.json()

    const mine = shares.filter(
      (share: { recipe: { slug: string } }) =>
        share.recipe.slug === byMember || share.recipe.slug === byOwner
    )
    expect(mine).toHaveLength(2)
    expect(mine[0].recipe).toEqual({ slug: byOwner, name: "Owner's Okra" })
    expect(mine[0].url).toBe(url)
    expect(mine[0].sharedBy.name).toBeTruthy()
    expect(mine[0].openedAt).toBeNull()
    expect(mine[1].recipe).toEqual({ slug: byMember, name: "Member's Mousse" })
    expect(mine[1].sharedBy).toEqual({ name: "list_member" })
    expect(mine[1].openedAt).toBeNull()
  })
})
