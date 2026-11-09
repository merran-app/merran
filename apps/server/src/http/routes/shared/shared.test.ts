import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { Household, RecipeShare } from "../../../database/entities/index.ts"
import { ACROSS_HOUSEHOLDS } from "../../../database/scope.ts"
import type { Database } from "../../../database/orm.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  TestClient,
  type TestResponse,
} from "../../../test/app.ts"

let app: App
let database: Database
let close: () => Promise<void>
let owner: TestClient

beforeAll(async () => {
  const testApp = await createTestApp({ publicUrl: TEST_ORIGIN })
  ;({ app, database, close } = testApp)
  owner = await setUpServer(app, testApp.setupCode)
})

afterAll(() => close())

const SECRETS = {
  note: "Private cook note about the oven",
  tag: "private-tag-text",
  notes: "Private recipe notes for the household",
}

async function makeRecipe(name: string) {
  const res = await owner.post("/api/recipes", {
    name,
    description: "A bright pasta.",
    servings: 4,
    yieldText: "4 bowls",
    prepMinutes: 10,
    cookMinutes: 20,
    sourceUrl: "https://example.com/pasta",
    notes: SECRETS.notes,
    rating: 4.5,
    tags: [SECRETS.tag],
    ingredients: ["# Sauce", "2 lemons, juiced", "1 cup pasta"],
    steps: ["# Cook", "Boil the pasta.", "Toss with lemon."],
  })
  expect(res.status).toBe(201)
  const recipe = (await res.json()) as { id: string; slug: string }
  const noted = await owner.post(`/api/recipes/${recipe.slug}/cook-notes`, {
    note: SECRETS.note,
    rating: 5,
  })
  expect(noted.status).toBeLessThan(300)
  return recipe
}

async function shareToken(slug: string) {
  const res = await owner.post(`/api/recipes/${slug}/share`)
  expect(res.status).toBe(200)
  const { url } = (await res.json()) as { url: string }
  return url.split("/r/")[1]!
}

/** A request with no cookie and no key, like a stranger's browser. */
const signedOut = async (path: string) =>
  (await app.request(`${TEST_ORIGIN}${path}`)) as TestResponse

const photoOf = (background: string) =>
  sharp({ create: { width: 400, height: 300, channels: 3, background } })
    .png()
    .toBuffer()

async function setSharing(on: boolean) {
  const em = database.em.fork()
  const home = await (await owner.get("/api/households/current")).json()
  const household = await em.findOneOrFail(Household, home.id)
  household.settings = { ...household.settings, sharing: { recipes: on } }
  await em.flush()
}

describe("a shared recipe", () => {
  test("anyone with the link reads the recipe, signed out", async () => {
    const recipe = await makeRecipe("Open Pasta")
    const token = await shareToken(recipe.slug)

    const res = await signedOut(`/api/shared/${token}`)

    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(res.headers.get("referrer-policy")).toBe("no-referrer")
    const body = await res.json()
    expect(body.name).toBe("Open Pasta")
    expect(body.household.name).toBeTruthy()
    expect(body.ingredients.map((line: { text: string }) => line.text)).toEqual(
      ["2 lemons, juiced", "1 cup pasta"]
    )
    expect(body.ingredients[0].section).toBe("Sauce")
  })

  test("only the allowed fields are shared", async () => {
    const recipe = await makeRecipe("Careful Pasta")
    const token = await shareToken(recipe.slug)

    const body = await (await signedOut(`/api/shared/${token}`)).json()

    expect(Object.keys(body).sort()).toEqual(
      [
        "name",
        "description",
        "servings",
        "yieldText",
        "prepMinutes",
        "cookMinutes",
        "totalMinutes",
        "diets",
        "nutrition",
        "sourceUrl",
        "photo",
        "ingredients",
        "steps",
        "household",
      ].sort()
    )
    for (const line of body.ingredients) {
      expect(Object.keys(line).sort()).toEqual(
        [
          "id",
          "section",
          "text",
          "quantity",
          "quantityMax",
          "unit",
          "food",
          "note",
        ].sort()
      )
    }
    for (const step of body.steps) {
      expect(Object.keys(step).sort()).toEqual(["id", "section", "text"].sort())
    }
    expect(Object.keys(body.household)).toEqual(["name"])
    expect(body.ingredients.map((line: { id: string }) => line.id)).toEqual([
      "i1",
      "i2",
    ])
    expect(body.steps.map((step: { id: string }) => step.id)).toEqual([
      "s1",
      "s2",
    ])

    const everything = JSON.stringify(body)
    expect(everything).not.toContain(recipe.id)
    expect(everything).not.toContain(recipe.slug)
    expect(everything).not.toContain(SECRETS.note)
    expect(everything).not.toContain(SECRETS.tag)
    expect(everything).not.toContain(SECRETS.notes)
    expect(body).not.toHaveProperty("rating")
  })

  test("a link fails the same way however it fails", async () => {
    const sameAs = async (path: string) => {
      const res = await signedOut(path)
      expect(res.status).toBe(404)
      return res.json()
    }
    const unknown = await sameAs(`/api/shared/${"a".repeat(43)}`)
    expect(unknown).toEqual({
      error: { code: "not_found", message: "This recipe isn't shared." },
    })
    expect(await sameAs("/api/shared/short")).toEqual(unknown)

    const stopped = await makeRecipe("Stopped Pasta")
    const stoppedToken = await shareToken(stopped.slug)
    expect(
      (await owner.delete(`/api/recipes/${stopped.slug}/share`)).status
    ).toBe(204)
    expect(await sameAs(`/api/shared/${stoppedToken}`)).toEqual(unknown)

    const off = await makeRecipe("Off Pasta")
    const offToken = await shareToken(off.slug)
    await setSharing(false)
    try {
      expect(await sameAs(`/api/shared/${offToken}`)).toEqual(unknown)
      expect(await sameAs(`/api/shared/${offToken}/photo`)).toEqual(unknown)
    } finally {
      await setSharing(true)
    }
    expect((await signedOut(`/api/shared/${offToken}`)).status).toBe(200)

    const deleted = await makeRecipe("Deleted Pasta")
    const deletedToken = await shareToken(deleted.slug)
    expect((await owner.delete(`/api/recipes/${deleted.slug}`)).status).toBe(
      204
    )
    expect(await sameAs(`/api/shared/${deletedToken}`)).toEqual(unknown)
  })

  test("a restored recipe is shared again", async () => {
    const recipe = await makeRecipe("Restored Pasta")
    const token = await shareToken(recipe.slug)

    expect((await owner.delete(`/api/recipes/${recipe.slug}`)).status).toBe(204)
    expect((await signedOut(`/api/shared/${token}`)).status).toBe(404)

    const restored = await owner.post(
      `/api/recipes/deleted/${recipe.id}/restore`
    )
    expect(restored.status).toBe(200)
    const res = await signedOut(`/api/shared/${token}`)
    expect(res.status).toBe(200)
    expect((await res.json()).name).toBe("Restored Pasta")
  })

  test("being signed in changes nothing", async () => {
    const recipe = await makeRecipe("Same Pasta")
    const token = await shareToken(recipe.slug)
    const path = `/api/shared/${token}`

    const stranger = await (await signedOut(path)).json()
    expect(await (await owner.get(path)).json()).toEqual(stranger)

    // A key from another household on the same server.
    const home = await (await owner.get("/api/households/current")).json()
    const created = await owner.post("/api/households", { name: "Other home" })
    expect(created.status).toBe(201)
    try {
      const made = await (
        await owner.post("/api/auth/api-keys", {
          name: "Elsewhere",
          permissions: { recipes: "write" },
          expiresInDays: 90,
        })
      ).json()
      const withKey = await app.request(`${TEST_ORIGIN}${path}`, {
        headers: { authorization: `Bearer ${made.key}` },
      })
      expect(withKey.status).toBe(200)
      expect(await withKey.json()).toEqual(stranger)
      // Signed in to the other household, the body is the same too.
      expect(await (await owner.get(path)).json()).toEqual(stranger)
    } finally {
      await owner.post("/api/auth/organization/set-active", {
        organizationId: home.id,
      })
    }
  })

  test("opening a link notes when, at most hourly", async () => {
    const recipe = await makeRecipe("Opened Pasta")
    const token = await shareToken(recipe.slug)
    const opened = async () => {
      const em = database.em.fork()
      const share = await em.findOneOrFail(
        RecipeShare,
        { token },
        ACROSS_HOUSEHOLDS
      )
      return share.openedAt
    }
    expect(await opened()).toBeNull()

    await signedOut(`/api/shared/${token}`)
    const first = await opened()
    expect(first).toBeInstanceOf(Date)

    await signedOut(`/api/shared/${token}`)
    expect((await opened())?.getTime()).toBe(first?.getTime())

    // An hour on, the next open is noted again.
    const em = database.em.fork()
    const share = await em.findOneOrFail(
      RecipeShare,
      { token },
      ACROSS_HOUSEHOLDS
    )
    share.openedAt = new Date(Date.now() - 2 * 3_600_000)
    await em.flush()
    await signedOut(`/api/shared/${token}`)
    expect((await opened())!.getTime()).toBeGreaterThan(Date.now() - 60_000)
  })

  test("too many reads are slowed", async () => {
    const recipe = await makeRecipe("Busy Pasta")
    const token = await shareToken(recipe.slug)

    let last: Response | undefined
    for (let n = 0; n < 121; n += 1) {
      last = await signedOut(`/api/shared/${token}`)
    }

    expect(last?.status).toBe(429)
    expect(last?.headers.get("retry-after")).toMatch(/^\d+$/)
  }, 30_000)
})

describe("a shared recipe's photo", () => {
  test("is served for the link's own recipe, and only that one", async () => {
    const red = await makeRecipe("Red Pasta")
    const blue = await makeRecipe("Blue Pasta")
    for (const [recipe, color] of [
      [red, "#c33"],
      [blue, "#33c"],
    ] as const) {
      const put = await owner.upload(
        `/api/recipes/${recipe.slug}/photo`,
        await photoOf(color),
        "image/png"
      )
      expect(put.status).toBe(200)
    }
    const redToken = await shareToken(red.slug)
    const blueToken = await shareToken(blue.slug)

    const page = await (await signedOut(`/api/shared/${redToken}`)).json()
    expect(page.photo.full).toMatch(
      new RegExp(`^/api/shared/${redToken}/photo\\?size=full&v=\\w+$`)
    )
    expect(page.photo.card).toContain("size=card")
    expect(JSON.stringify(page.photo)).not.toContain(red.id)

    const res = await signedOut(page.photo.full)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/webp")
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    )
    expect(res.headers.get("referrer-policy")).toBe("no-referrer")

    const redBytes = Buffer.from(await res.arrayBuffer())
    const blueBytes = Buffer.from(
      await (await signedOut(`/api/shared/${blueToken}/photo`)).arrayBuffer()
    )
    expect(redBytes.equals(blueBytes)).toBe(false)

    const stale = await signedOut(`/api/shared/${redToken}/photo?v=old`)
    expect(stale.status).toBe(200)
    expect(stale.headers.get("cache-control")).toBe("no-store")
  })

  test("is missing for a recipe without one", async () => {
    const recipe = await makeRecipe("Plain Pasta")
    const token = await shareToken(recipe.slug)

    const page = await (await signedOut(`/api/shared/${token}`)).json()
    expect(page.photo).toBeNull()

    const res = await signedOut(`/api/shared/${token}/photo`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: { code: "not_found", message: "This recipe isn't shared." },
    })
  })
})
