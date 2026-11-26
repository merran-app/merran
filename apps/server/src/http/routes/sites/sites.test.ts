import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { AppError } from "../../../core/errors.ts"
import {
  Household,
  Import,
  ImportItem,
  RecipeSite,
  SiteRecipe,
} from "../../../database/entities/index.ts"
import { forHousehold } from "../../../database/scope.ts"
import type { Database } from "../../../database/orm.ts"
import type { Fetcher } from "../../../services/fetch/public-fetch.ts"
import { enqueue } from "../../../services/jobs/jobs.ts"
import type { JobRunner } from "../../../services/jobs/runner.ts"
import { collectionRecipes } from "../../../services/recipes/discover/sites/collections.ts"
import { siteData } from "../../../services/recipes/discover/sites/data.ts"
import { forgetRobots } from "../../../services/recipes/discover/sites/robots.ts"
import { PACE } from "../../../services/recipes/discover/sites/shelf.ts"
import { createTestApp, setUpServer, TestClient } from "../../../test/app.ts"

const recipePage = (recipe: Record<string, unknown>) =>
  `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "Recipe",
      recipeInstructions: [{ "@type": "HowToStep", text: "Cook it." }],
      ...recipe,
    }
  )}</script></head><body></body></html>`

const FEED = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Cooking Example</title>
  <link>https://cooking.example/</link>
  <item><title>Lentil Soup</title><link>https://cooking.example/lentil-soup/</link><pubDate>Wed, 15 Oct 2026 08:00:00 +0000</pubDate></item>
  <item><title>Peanut Noodles</title><link>https://cooking.example/peanut-noodles/?utm_source=rss</link><pubDate>Tue, 14 Oct 2026 08:00:00 +0000</pubDate></item>
  <item><title>Ten Kitchen Tips</title><link>https://cooking.example/kitchen-tips/</link><pubDate>Mon, 13 Oct 2026 08:00:00 +0000</pubDate></item>
  <item><title>Secret Stew</title><link>https://cooking.example/private/secret-stew/</link><pubDate>Sun, 12 Oct 2026 08:00:00 +0000</pubDate></item>
</channel></rss>`

/** The tests' little internet: pages by link, with a status if not 200. */
const web = new Map<
  string,
  { body: Buffer | string; contentType?: string; status?: number }
>()
const asked: string[] = []

const fetcher: Fetcher = async (url, options = {}) => {
  asked.push(url)
  const page = web.get(url)
  const status = page?.status ?? (page ? 200 : 404)
  if (status >= 400 && !options.keepErrors) {
    throw new AppError(
      "upstream",
      status === 403 ? "site_refused" : "site_error",
      "That site answered with an error."
    )
  }
  return {
    url,
    status,
    contentType: page?.contentType ?? "text/html; charset=utf-8",
    body: Buffer.from(page?.body ?? ""),
  }
}

let app: App
let close: () => Promise<void>
let database: Database
let filesDir: string
let jobs: JobRunner
let kyle: TestClient

beforeAll(async () => {
  PACE.seconds = 0
  forgetRobots()
  web.set("https://cooking.example/", {
    body: `<html><head>
      <link rel="alternate" type="application/rss+xml" title="Comments" href="/comments/feed/">
      <link rel="alternate" type="application/rss+xml" href="/feed/">
    </head><body>Home</body></html>`,
  })
  web.set("https://cooking.example/feed/", {
    body: FEED,
    contentType: "application/rss+xml",
  })
  web.set("https://cooking.example/robots.txt", {
    body: "User-agent: *\nDisallow: /private/\n",
    contentType: "text/plain",
  })
  web.set("https://cooking.example/lentil-soup/", {
    body: recipePage({
      name: "Lentil Soup",
      description: "Thick, warming and cheap.",
      image: "https://cooking.example/lentil-soup.jpg",
      totalTime: "PT40M",
      recipeCategory: "Soup",
      recipeCuisine: "Middle Eastern",
      keywords: "lentils, easy, vegan",
      recipeIngredient: ["1 cup red lentils", "1 onion", "4 cups water"],
    }),
  })
  web.set("https://cooking.example/peanut-noodles/", {
    body: recipePage({
      name: "Peanut Noodles",
      recipeCategory: "Main Course",
      totalTime: "PT20M",
      recipeIngredient: ["200 g noodles", "3 tbsp peanut butter"],
    }),
  })
  web.set("https://cooking.example/kitchen-tips/", {
    body: "<html><body>Ten tips</body></html>",
  })
  web.set("https://cooking.example/private/secret-stew/", {
    body: recipePage({ name: "Secret Stew", recipeIngredient: ["beef"] }),
  })
  web.set("https://cooking.example/lentil-soup.jpg", {
    body: await sharp({
      create: { width: 1200, height: 900, channels: 3, background: "#a63" },
    })
      .jpeg()
      .toBuffer(),
    contentType: "image/jpeg",
  })
  web.set("https://plain.example/", { body: "<html><body>Hi</body></html>" })

  const test = await createTestApp({ fetcher })
  ;({ app, close, database, jobs, filesDir } = test)
  kyle = await setUpServer(app, test.setupCode)
})

afterAll(async () => {
  PACE.seconds = 3
  await close()
})

type Site = {
  id: string
  name: string
  reading: boolean
  waiting: number
  total: number
  error: string | null
  recipes: {
    id: string
    name: string
    url: string
    photo: string | null
    minutes: number | null
    description: string | null
    suits: boolean
    inLibrary: { slug: string } | null
  }[]
}

describe("following a site", () => {
  let followed: Site

  test("finds its feed from any page, then reads it in the background", async () => {
    const res = await kyle.post("/api/sites", {
      url: "https://cooking.example/",
    })
    expect(res.status).toBe(201)
    followed = await res.json()
    expect(followed).toMatchObject({
      name: "Cooking Example",
      reading: true,
      recipes: [],
    })

    await jobs.drain()
    const { sites } = await (await kyle.get("/api/sites")).json()
    expect(sites).toHaveLength(1)
    const [site] = sites as Site[]
    expect(site).toMatchObject({ reading: false, waiting: 0, error: null })
    // Not the tips, which aren't a recipe, nor what robots.txt keeps it from.
    expect(site!.recipes.map((recipe) => recipe.name)).toEqual([
      "Lentil Soup",
      "Peanut Noodles",
    ])
    expect(site!.recipes[0]).toMatchObject({
      url: "https://cooking.example/lentil-soup/",
      minutes: 40,
      description: "Thick, warming and cheap.",
      suits: true,
      inLibrary: null,
    })
    // The tracking bit is left off.
    expect(site!.recipes[1]!.url).toBe(
      "https://cooking.example/peanut-noodles/"
    )
    expect(asked).not.toContain("https://cooking.example/private/secret-stew/")
  })

  test("keeps what the shelf learned about each recipe", async () => {
    const em = database.em.fork()
    const soup = await em.findOneOrFail(SiteRecipe, {
      url: "https://cooking.example/lentil-soup/",
    })
    expect(soup).toMatchObject({
      courses: ["soup"],
      siteName: "Cooking Example",
      state: "recipe",
    })
    expect(soup.keywords).toEqual(
      expect.arrayContaining(["soup", "middle eastern", "lentils", "vegan"])
    )
    expect(soup.diets).toEqual(expect.arrayContaining(["vegan", "vegetarian"]))
    const tips = await em.findOneOrFail(SiteRecipe, {
      url: "https://cooking.example/kitchen-tips/",
    })
    expect(tips.state).toBe("not-recipe")
  })

  test("says which recipes don't suit the household, and keeps them out of the spotlight", async () => {
    await kyle.put("/api/households/current/tastes", {
      avoid: [{ food: "peanuts", level: "allergy" }],
      diets: [],
      weeknightMinutes: null,
    })
    const { sites } = await (await kyle.get("/api/sites")).json()
    expect(
      (sites as Site[])[0]!.recipes.map((recipe) => [recipe.name, recipe.suits])
    ).toEqual([
      ["Lentil Soup", true],
      ["Peanut Noodles", false],
    ])
    const { recipes } = await (await kyle.get("/api/sites/recipes")).json()
    expect(
      recipes.map((recipe: Site["recipes"][number]) => recipe.name)
    ).toEqual(["Lentil Soup"])
  })

  test("knows which are in the library", async () => {
    const imported = await kyle.post("/api/recipes/import", {
      url: "https://cooking.example/lentil-soup/",
    })
    expect(imported.status).toBe(201)
    const { recipes } = await (await kyle.get("/api/sites/recipes")).json()
    expect(recipes[0].inLibrary).toMatchObject({ slug: "lentil-soup" })
  })

  test("shows each photo small, through Merran", async () => {
    const { recipes } = await (await kyle.get("/api/sites/recipes")).json()
    const res = await kyle.get(recipes[0].photo)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/webp")
    const photo = Buffer.from(await res.arrayBuffer())
    expect((await sharp(photo).metadata()).width).toBe(640)

    // Fetched once: the second time it's the kept copy.
    const fetched = asked.filter((url) =>
      url.endsWith("lentil-soup.jpg")
    ).length
    expect((await kyle.get(recipes[0].photo)).status).toBe(200)
    expect(asked.filter((url) => url.endsWith("lentil-soup.jpg"))).toHaveLength(
      fetched
    )
  })

  test("asks the feed again only for what's new", async () => {
    web.set("https://cooking.example/feed/", {
      body: "",
      status: 304,
    })
    const em = database.em.fork()
    const site = await em.findOneOrFail(RecipeSite, {
      feedUrl: "https://cooking.example/feed/",
    })
    site.nextReadAt = new Date(0)
    await em.flush()
    await enqueue(em, { kind: "sites.read", payload: { siteId: site.id } })
    await jobs.drain()
    const { sites } = await (await kyle.get("/api/sites")).json()
    expect(sites[0]).toMatchObject({ error: null })
    expect(sites[0].recipes).toHaveLength(2)
    web.set("https://cooking.example/feed/", {
      body: FEED,
      contentType: "application/rss+xml",
    })
  })

  test("won't follow a site twice, and stops following it", async () => {
    const again = await kyle.post("/api/sites", {
      url: "https://cooking.example/feed/",
    })
    expect(again.status).toBe(409)

    expect((await kyle.delete(`/api/sites/${followed.id}`)).status).toBe(204)
    const list = await (await kyle.get("/api/sites")).json()
    expect(list.sites).toEqual([])
    expect(
      list.suggestions.map((site: { name: string }) => site.name)
    ).toContain("RecipeTin Eats")
    expect((await kyle.delete(`/api/sites/${followed.id}`)).status).toBe(404)
  })

  test("suggestions say how many sites are followed, without reading them", async () => {
    type Suggestions = { following: number; suggestions: { name: string }[] }
    const suggestions = async () => {
      const res = await kyle.get("/api/sites/suggestions")
      expect(res.status).toBe(200)
      return (await res.json()) as Suggestions
    }
    const names = (list: Suggestions) =>
      list.suggestions.map((site) => site.name)

    const none = await suggestions()
    expect(none).not.toHaveProperty("sites")
    expect(none.following).toBe(0)
    expect(names(none)).toContain("RecipeTin Eats")

    const res = await kyle.post("/api/sites", {
      url: "https://www.recipetineats.com/",
    })
    const { id } = (await res.json()) as { id: string }
    const one = await suggestions()
    expect(one.following).toBe(1)
    expect(names(one)).not.toContain("RecipeTin Eats")
    expect(one.suggestions).toHaveLength(none.suggestions.length - 1)

    // As it was, for the tests after.
    expect((await kyle.delete(`/api/sites/${id}`)).status).toBe(204)
  })

  test("follows a suggestion as it's listed", async () => {
    const res = await kyle.post("/api/sites", {
      url: "https://www.recipetineats.com/",
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      name: "RecipeTin Eats",
      feedUrl: "https://www.recipetineats.com/feed/",
    })
  })

  test("says when a site has no feed", async () => {
    const res = await kyle.post("/api/sites", { url: "https://plain.example/" })
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("no_feed")
  })
})

describe("the half-hourly read", () => {
  test("adds the suggested sites and classics, and opens the classics", async () => {
    const em = database.em.fork()
    await enqueue(em, { kind: "sites.read" })
    await jobs.drain()

    const english = siteData().get("en")!
    const sites = await em.find(RecipeSite, {
      feedUrl: { $in: english.sites.map((site) => site.feedUrl) },
    })
    expect(sites).toHaveLength(english.sites.length)
    const classics = await em.find(SiteRecipe, { classic: true })
    const listed = new Set(
      english.collections.flatMap((collection) =>
        collection.classics.map((classic) => classic.url)
      )
    )
    expect(classics).toHaveLength(listed.size)
    // None of them answer in these tests, so each is tried again later.
    expect(classics.every((row) => row.openedAt && row.failures === 1)).toBe(
      true
    )
  })
})

describe("starter collections", () => {
  const soups = siteData()
    .get("en")!
    .collections.find((collection) => collection.id === "soups")!

  beforeAll(async () => {
    const em = database.em.fork()
    const row = (name: string, more: Partial<SiteRecipe> = {}) =>
      em.create(SiteRecipe, {
        url: `https://soups.example/${name.toLowerCase().replace(/\W+/g, "-")}`,
        state: "recipe",
        siteName: "Soups Example",
        name,
        courses: ["soup"],
        keywords: [],
        ingredients: ["1 onion", "4 cups stock"],
        diets: [],
        publishedAt: new Date(),
        ...more,
      })
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)
    row("Tomato Soup", { publishedAt: daysAgo(1) })
    row("Corn Chowder", { courses: [], publishedAt: daysAgo(2) })
    row("Peanut Stew", {
      ingredients: ["1 cup peanuts"],
      publishedAt: daysAgo(3),
    })
    // Older than a month: after the classics.
    row("Pea Soup", { publishedAt: daysAgo(60) })
    // A classic that opened: it's listed with the collection.
    const classic = await em.findOneOrFail(SiteRecipe, {
      url: soups.classics[0]!.url,
    })
    Object.assign(classic, {
      state: "recipe",
      name: "French Onion Soup",
      courses: ["soup"],
      ingredients: ["6 onions"],
    })
    await em.flush()
  })

  test("are listed when there are enough that suit the household", async () => {
    const { collections } = await (await kyle.get("/api/collections")).json()
    const listed = collections.find(
      (collection: { id: string }) => collection.id === "soups"
    )
    // Six fit, but the peanut stew doesn't suit them, and the lentil soup
    // from the site followed before is in the library.
    expect(listed).toMatchObject({ title: soups.title, count: 5, toImport: 4 })
    // The rest have too few.
    expect(
      collections.map((collection: { id: string }) => collection.id)
    ).toEqual(["soups"])
  })

  test("show their recipes: new ones, then the classics", async () => {
    const res = await kyle.get("/api/collections/soups")
    expect(res.status).toBe(200)
    const collection = await res.json()
    expect(
      collection.recipes.map((recipe: { name: string }) => recipe.name)
    ).toEqual([
      "Tomato Soup",
      "Corn Chowder",
      "French Onion Soup",
      "Pea Soup",
      // In the library already: last.
      "Lentil Soup",
    ])
    expect(collection.found).toBeNull()
    expect((await kyle.get("/api/collections/nope")).status).toBe(404)
  })

  test("import whole, in the background", async () => {
    const res = await kyle.post("/api/collections/soups/import")
    expect(res.status).toBe(202)
    const started = await res.json()
    expect(started).toMatchObject({ kind: "collection", total: 4 })
    // Its record says which collection it was.
    const record = await database.em
      .fork()
      .findOneOrFail(Import, { id: started.id }, { filters: false })
    expect(record).toMatchObject({
      kind: "collection",
      source: "Soups & stews",
    })
  })

  test("need AI to find more", async () => {
    const res = await kyle.post("/api/collections/soups/find")
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toMatch(/^ai_/)
  })
})

describe("photos kept as a site is read", () => {
  const jpeg = () =>
    sharp({
      create: { width: 800, height: 600, channels: 3, background: "#369" },
    })
      .jpeg()
      .toBuffer()

  /** A site with a feed that hasn't changed, so only what a test adds is read. */
  async function quietSite(host: string) {
    web.set(`https://${host}/feed/`, { body: "", status: 304 })
    const em = database.em.fork()
    const site = em.create(RecipeSite, {
      name: host,
      url: `https://${host}/`,
      feedUrl: `https://${host}/feed/`,
    })
    await em.flush()
    return site
  }

  async function readNow(siteId: string) {
    const em = database.em.fork()
    await enqueue(em, { kind: "sites.read", payload: { siteId } })
    await jobs.drain()
  }

  const keptFile = (photo: string) =>
    readFile(join(filesDir, "site-photos", `${photo}.webp`))

  test("a post that opens as a recipe has its photo kept as the site's read", async () => {
    web.set("https://fresh.example/feed/", {
      body: `<?xml version="1.0"?><rss version="2.0"><channel>
        <title>Fresh Example</title><link>https://fresh.example/</link>
        <item><title>Fresh Bread</title><link>https://fresh.example/bread/</link><pubDate>Wed, 15 Oct 2026 08:00:00 +0000</pubDate></item>
      </channel></rss>`,
      contentType: "application/rss+xml",
    })
    web.set("https://fresh.example/bread/", {
      body: recipePage({
        name: "Fresh Bread",
        image: "https://fresh.example/bread.jpg",
        recipeIngredient: ["500 g flour"],
      }),
    })
    web.set("https://fresh.example/bread.jpg", {
      body: await jpeg(),
      contentType: "image/jpeg",
    })
    const em = database.em.fork()
    const site = em.create(RecipeSite, {
      name: "Fresh Example",
      url: "https://fresh.example/",
      feedUrl: "https://fresh.example/feed/",
    })
    await em.flush()

    await readNow(site.id)

    const row = await database.em
      .fork()
      .findOneOrFail(SiteRecipe, { url: "https://fresh.example/bread/" })
    expect(row.state).toBe("recipe")
    expect(row.photo).toBeTruthy()
    const kept = await keptFile(row.photo!)
    expect((await sharp(kept).metadata()).width).toBe(640)
  })

  test("each read fills in a few older recipes' photos", async () => {
    const site = await quietSite("older.example")
    const picture = await jpeg()
    const em = database.em.fork()
    for (let number = 0; number < 8; number++) {
      web.set(`https://older.example/recipe-${number}.jpg`, {
        body: picture,
        contentType: "image/jpeg",
      })
      em.create(SiteRecipe, {
        site: em.getReference(RecipeSite, site.id),
        url: `https://older.example/recipe-${number}/`,
        state: "recipe",
        siteName: "older.example",
        name: `Recipe ${number}`,
        photoUrl: `https://older.example/recipe-${number}.jpg`,
        courses: [],
        keywords: [],
        ingredients: [],
        diets: [],
        publishedAt: new Date(Date.now() - number * 86_400_000),
      })
    }
    await em.flush()

    await readNow(site.id)

    const rows = await database.em
      .fork()
      .find(SiteRecipe, { site: site.id }, { orderBy: { publishedAt: "desc" } })
    const kept = rows.filter((row) => row.photo)
    expect(kept).toHaveLength(6)
    // The newest first, so what's looked at first is ready.
    expect(kept.map((row) => row.name)).toEqual(
      rows.slice(0, 6).map((row) => row.name)
    )
    for (const row of kept) await keptFile(row.photo!)

    // The rest come with the next read.
    await readNow(site.id)
    const after = await database.em
      .fork()
      .find(SiteRecipe, { site: site.id }, { fields: ["photo"] })
    expect(after.filter((row) => row.photo)).toHaveLength(8)
  })

  test("a photo that won't load doesn't stop the read", async () => {
    const site = await quietSite("broken.example")
    web.set("https://broken.example/gone.jpg", { body: "", status: 404 })
    const em = database.em.fork()
    em.create(SiteRecipe, {
      site: em.getReference(RecipeSite, site.id),
      url: "https://broken.example/gone-recipe/",
      state: "recipe",
      siteName: "broken.example",
      name: "Gone",
      photoUrl: "https://broken.example/gone.jpg",
      courses: [],
      keywords: [],
      ingredients: [],
      diets: [],
    })
    await em.flush()

    await readNow(site.id)

    const read = await database.em.fork().findOneOrFail(RecipeSite, site.id)
    expect(read.nextReadAt.getTime()).toBeGreaterThan(Date.now())
    const row = await database.em
      .fork()
      .findOneOrFail(SiteRecipe, { url: "https://broken.example/gone-recipe/" })
    expect(row.photo).toBe("")
  })
})

describe("keeping the shelf small", () => {
  test("keeps each site's newest recipes and forgets the rest", async () => {
    web.set("https://many.example/feed/", { body: "", status: 304 })
    const em = database.em.fork()
    const site = em.create(RecipeSite, {
      name: "Many Example",
      url: "https://many.example/",
      feedUrl: "https://many.example/feed/",
    })
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)
    for (let day = 0; day < 125; day++) {
      em.create(SiteRecipe, {
        site,
        url: `https://many.example/recipe-${day}/`,
        state: "recipe",
        siteName: "Many Example",
        name: `Recipe ${day}`,
        courses: [],
        keywords: [],
        ingredients: [],
        diets: [],
        publishedAt: daysAgo(day),
      })
    }
    await em.flush()

    await enqueue(em, { kind: "sites.read", payload: { siteId: site.id } })
    await jobs.drain()

    const kept = await database.em
      .fork()
      .find(SiteRecipe, { site: site.id }, { orderBy: { publishedAt: "desc" } })
    // The newest 120: the five oldest are forgotten.
    expect(kept).toHaveLength(120)
    expect(kept.at(-1)!.name).toBe("Recipe 119")
  })
})

describe("show more of a followed site, and a spotlight that suits", () => {
  const AVOID_PEANUTS = {
    avoid: [{ food: "peanuts", level: "allergy" }],
    diets: [],
    weeknightMinutes: null,
  }
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000)
  const minutesAgo = (minutes: number) =>
    new Date(Date.now() - minutes * 60_000)

  let pagedSite: RecipeSite
  let peanutSite: RecipeSite
  let sites: Site[]
  let site: Site

  /**
   * A site on the shelf with its feed in the test web, read just now and
   * not again for an hour, so following it queues no read.
   */
  async function readSite(name: string, host: string) {
    web.set(`https://${host}/feed/`, {
      body: `<?xml version="1.0"?><rss version="2.0"><channel>
        <title>${name}</title><link>https://${host}/</link>
      </channel></rss>`,
      contentType: "application/rss+xml",
    })
    const em = database.em.fork()
    const created = em.create(RecipeSite, {
      name,
      url: `https://${host}/`,
      feedUrl: `https://${host}/feed/`,
      readAt: new Date(),
      nextReadAt: new Date(Date.now() + 3_600_000),
    })
    await em.flush()
    return created
  }

  /** Recipes on a site's shelf, by name, each posted when `posted` says. */
  async function shelve(
    on: RecipeSite,
    names: string[],
    posted: (index: number) => Date,
    ingredients: string[]
  ) {
    const em = database.em.fork()
    names.forEach((name, index) => {
      em.create(SiteRecipe, {
        site: em.getReference(RecipeSite, on.id),
        url: `${on.url}${name.toLowerCase().replace(/\W+/g, "-")}/`,
        state: "recipe",
        siteName: on.name,
        name,
        courses: [],
        keywords: [],
        ingredients,
        diets: [],
        publishedAt: posted(index),
      })
    })
    await em.flush()
  }

  const numbered = (prefix: string, count: number, from = 0) =>
    Array.from({ length: count }, (_, index) => `${prefix} ${from + index}`)

  beforeAll(async () => {
    await kyle.put("/api/households/current/tastes", AVOID_PEANUTS)

    pagedSite = await readSite("Paged Example", "paged.example")
    await shelve(
      pagedSite,
      numbered("Paged", 30),
      (index) => daysAgo(index + 1),
      ["1 onion", "2 cups rice"]
    )
    // The 10 newest recipes on followed sites have peanuts, which the
    // household avoids.
    peanutSite = await readSite("Peanut Example", "peanut.example")
    await shelve(
      peanutSite,
      numbered("Peanut Noodles", 10),
      (index) => hoursAgo(index + 1),
      ["200 g noodles", "3 tbsp peanut butter"]
    )

    for (const followed of [pagedSite, peanutSite]) {
      const res = await kyle.post("/api/sites", { url: followed.feedUrl })
      expect(res.status).toBe(201)
    }
    ;({ sites } = await (await kyle.get("/api/sites")).json())
    site = sites.find((found) => found.name === "Paged Example")!
  })

  test("a followed site shows its newest 24 and how many it has", async () => {
    expect(site.recipes).toHaveLength(24)
    expect(site.total).toBe(30)
    expect(site.recipes[0]!.name).toBe("Paged 0")
  })

  test("Show more brings the next of a site's recipes", async () => {
    const page = await (
      await kyle.get(`/api/sites/${site.id}/recipes?offset=24&limit=24`)
    ).json()
    expect(page.total).toBe(30)
    expect(page.recipes.map((recipe: { name: string }) => recipe.name)).toEqual(
      ["Paged 24", "Paged 25", "Paged 26", "Paged 27", "Paged 28", "Paged 29"]
    )
    const beyond = await (
      await kyle.get(`/api/sites/${site.id}/recipes?offset=90`)
    ).json()
    expect(beyond).toEqual({ recipes: [], total: 30 })
    expect((await kyle.get(`/api/sites/${randomUUID()}/recipes`)).status).toBe(
      404
    )
  })

  test("each site says how many posts wait, counted for all at once", async () => {
    const em = database.em.fork()
    const waiting = ["first", "second"].map((post) =>
      em.create(SiteRecipe, {
        site: em.getReference(RecipeSite, pagedSite.id),
        url: `https://paged.example/waiting-${post}/`,
        state: "waiting",
        siteName: "Paged Example",
        courses: [],
        keywords: [],
        ingredients: [],
        diets: [],
        publishedAt: new Date(),
      })
    )
    await em.flush()

    const after: Site[] = (await (await kyle.get("/api/sites")).json()).sites
    const counts = (list: Site[], name: string) => {
      const found = list.find((listed) => listed.name === name)!
      return { waiting: found.waiting, total: found.total }
    }
    expect(counts(after, "Paged Example")).toEqual({ waiting: 2, total: 30 })
    // Only the recipes count: what's waiting isn't shown yet.
    expect(after.find((listed) => listed.id === site.id)!.recipes).toHaveLength(
      24
    )
    const others = sites.filter((listed) => listed.id !== site.id)
    expect(others.map((other) => other.name)).toContain("Peanut Example")
    for (const other of others) {
      expect(counts(after, other.name)).toEqual(counts(sites, other.name))
    }
    expect(counts(after, "Peanut Example")).toEqual({ waiting: 0, total: 10 })

    // As it was, for the tests after.
    await em.remove(waiting).flush()
  })

  test("the spotlight gets recipes that suit the household, not just the newest", async () => {
    const { recipes } = await (await kyle.get("/api/sites/recipes")).json()
    expect(recipes).toHaveLength(24)
    expect(
      recipes.every((recipe: Site["recipes"][number]) => recipe.suits)
    ).toBe(true)
    expect(
      recipes.some((recipe: { name: string }) =>
        recipe.name.startsWith("Peanut")
      )
    ).toBe(false)
  })

  test("the spotlight looks past the newest 48 when none of them suit", async () => {
    // 40 more with peanuts, newer still: the newest 50 don't suit.
    await shelve(
      peanutSite,
      numbered("Peanut Noodles", 40, 10),
      (index) => minutesAgo(index + 1),
      ["200 g noodles", "3 tbsp peanut butter"]
    )
    const { recipes } = await (await kyle.get("/api/sites/recipes")).json()
    expect(recipes.map((recipe: { name: string }) => recipe.name)).toEqual(
      numbered("Paged", 24)
    )
  })

  test("the spotlight is empty when nothing suits", async () => {
    // None of the followed sites' recipes are labelled vegan.
    await kyle.put("/api/households/current/tastes", {
      ...AVOID_PEANUTS,
      diets: ["vegan"],
    })
    const { recipes } = await (await kyle.get("/api/sites/recipes")).json()
    expect(recipes).toEqual([])

    // As it was, for the tests after.
    await kyle.put("/api/households/current/tastes", AVOID_PEANUTS)
  })
})

describe("show more of a collection, and import what's shown", () => {
  type Listed = {
    id: string
    url: string
    inLibrary: { slug: string } | null
  }
  type Page = { count: number; toImport: number; recipes: Listed[] }

  const SOUPS = 30
  let bulk: SiteRecipe[]

  async function collection(query = "") {
    const res = await kyle.get(`/api/collections/soups${query}`)
    expect(res.status).toBe(200)
    return (await res.json()) as Page
  }

  beforeAll(async () => {
    // 30 more soups that suit the household, so "soups" has over 24.
    const em = database.em.fork()
    bulk = Array.from({ length: SOUPS }, (_, index) =>
      em.create(SiteRecipe, {
        url: `https://bulk-soups.example/soup-${index}/`,
        state: "recipe",
        siteName: "Bulk Soups",
        name: `Bulk Soup ${index}`,
        courses: ["soup"],
        keywords: [],
        ingredients: ["1 onion", "4 cups stock"],
        diets: [],
        publishedAt: new Date(Date.now() - index * 60_000),
      })
    )
    await em.flush()
  })

  afterAll(async () => {
    const em = database.em.fork()
    await em
      .remove(await em.find(SiteRecipe, { id: bulk.map((row) => row.id) }))
      .flush()
  })

  test("a collection shows 24 at a time and says how many it has", async () => {
    const first = await collection()
    expect(first.recipes).toHaveLength(24)
    expect(first.count).toBeGreaterThan(24)

    const rest = await collection("?offset=24&limit=96")
    expect(rest.recipes).toHaveLength(first.count - 24)
    expect(rest.recipes.map((recipe) => recipe.id)).not.toContain(
      first.recipes[0]!.id
    )
    expect(rest.count).toBe(first.count)

    const beyond = await collection("?offset=500")
    expect(beyond.recipes).toEqual([])
    expect(beyond.count).toBe(first.count)
  })

  test("the collections list counts every recipe that suits, not just 24", async () => {
    const first = await collection()
    const { collections } = await (await kyle.get("/api/collections")).json()
    const listed = collections.find(
      (found: { id: string }) => found.id === "soups"
    )
    expect(listed.count).toBe(first.count)
    expect(listed.toImport).toBe(first.toImport)
  })

  test("Import these imports just the recipes shown", async () => {
    const first = await collection()
    const ids = first.recipes.slice(0, 3).map((recipe) => recipe.id)
    const res = await kyle.post("/api/collections/soups/import", {
      recipes: ids,
    })
    expect(res.status).toBe(202)
    expect((await res.json()).total).toBe(3)
  })

  test("Import these leaves out what's gone from the collection or into the library", async () => {
    const all = await collection("?limit=96")
    const unhad = all.recipes.filter((recipe) => !recipe.inLibrary)
    const had = all.recipes.find((recipe) => recipe.inLibrary)
    expect(had).toBeDefined()
    // A recipe on the shelf that isn't one of the soups.
    const { sites } = await (await kyle.get("/api/sites")).json()
    const elsewhere = sites.find((site: Site) => site.name === "Paged Example")
      .recipes[0].id

    // Left out, the import's total shows: one of the soups, one that isn't
    // in the collection, one that's in the library already, and one that
    // isn't a recipe at all.
    const res = await kyle.post("/api/collections/soups/import", {
      recipes: [unhad[0]!.id, elsewhere, had!.id, randomUUID()],
    })
    expect(res.status).toBe(202)
    expect((await res.json()).total).toBe(1)

    // With only those, there's nothing to import.
    const none = await kyle.post("/api/collections/soups/import", {
      recipes: [elsewhere, had!.id],
    })
    expect(none.status).toBe(409)
    expect((await none.json()).error.code).toBe("collection_imported")
  })

  test("Import these takes the collection's order, and no more than 100", async () => {
    const all = await collection("?limit=96")
    const unhad = all.recipes.filter((recipe) => !recipe.inLibrary)
    // Asked for backwards: it's imported as the collection lists them.
    const asked = [unhad[2]!.id, unhad[0]!.id, unhad[1]!.id]
    const res = await kyle.post("/api/collections/soups/import", {
      recipes: asked,
    })
    expect(res.status).toBe(202)
    const started = await res.json()
    expect(started.total).toBe(3)
    const items = await database.em
      .fork()
      .find(
        ImportItem,
        { import: started.id },
        { orderBy: { position: "asc" }, filters: false }
      )
    expect(items.map((item) => item.label)).toEqual(
      unhad.slice(0, 3).map((recipe) => recipe.url)
    )

    const tooMany = await kyle.post("/api/collections/soups/import", {
      recipes: Array.from({ length: 101 }, () => randomUUID()),
    })
    expect(tooMany.status).toBe(400)
    const empty = await kyle.post("/api/collections/soups/import", {
      recipes: [],
    })
    expect(empty.status).toBe(400)
  })

  test("without a body, it imports the first 100 not in the library", async () => {
    const first = await collection()
    const res = await kyle.post("/api/collections/soups/import")
    expect(res.status).toBe(202)
    expect((await res.json()).total).toBe(first.toImport)
  })

  test("what Find more leaves out is the whole collection, not just a page", async () => {
    // Find more's search needs AI, which these tests don't have, so this
    // is the list it gives its avoid names from.
    const first = await collection()
    const [household] = await database.em
      .fork()
      .find(Household, {}, { filters: false })
    const { recipes } = await collectionRecipes(
      forHousehold(database.em, household!.id),
      household!.id,
      "en",
      "soups"
    )
    expect(recipes).toHaveLength(first.count)
    expect(first.count).toBeGreaterThan(24)
  })

  test("recipes posted at the same moment keep one order across pages", async () => {
    const em = database.em.fork()
    const moment = new Date(Date.now() - 400 * 86_400_000)
    const tied = Array.from({ length: 6 }, (_, index) =>
      em.create(SiteRecipe, {
        url: `https://tied-soups.example/soup-${index}/`,
        state: "recipe",
        siteName: "Tied Soups",
        name: `Tied Soup ${index}`,
        courses: ["soup"],
        keywords: [],
        ingredients: ["1 onion"],
        diets: [],
        publishedAt: moment,
        createdAt: moment,
      })
    )
    await em.flush()
    try {
      const pages = [
        ...(await collection("?offset=0&limit=96")).recipes,
        ...(await collection("?offset=0&limit=96")).recipes,
      ].map((recipe) => recipe.id)
      const once = pages.slice(0, pages.length / 2)
      expect(pages.slice(pages.length / 2)).toEqual(once)
      // Paged in twos, they come out as the whole list does.
      const paged: string[] = []
      for (let offset = 0; offset < once.length; offset += 2) {
        const page = await collection(`?offset=${offset}&limit=2`)
        paged.push(...page.recipes.map((recipe) => recipe.id))
      }
      expect(paged).toEqual(once)
    } finally {
      await em.remove(tied).flush()
    }
  })
})
