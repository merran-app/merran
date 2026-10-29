import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import type { App } from "../../../../app.ts"
import { AppError } from "../../../../core/errors.ts"
import type {
  FetchOptions,
  Fetcher,
} from "../../../../services/fetch/public-fetch.ts"
import { createTestApp, setUpServer, TestClient } from "../../../../test/app.ts"

// Public addresses as numbers, so FlareSolverr's pages are checked without
// looking a name up.
const GUARDED = "https://93.184.216.34/beef-stew"
const OPEN = "https://93.184.216.35/lentil-soup"
const FLARESOLVERR = "http://flaresolverr:8191"

const page = (name: string, image: string) =>
  `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "Recipe",
      name,
      image,
      recipeIngredient: ["1 onion, diced"],
      recipeInstructions: [{ "@type": "HowToStep", text: "Cook it." }],
    }
  )}</script></head><body>${name}</body></html>`

/** What FlareSolverr does next: get through, or not. */
let flareSolverr: "solves" | "fails" = "solves"
/** Every link the server asked for, and how. */
const asked: { url: string; options: FetchOptions }[] = []

/**
 * The tests' little internet: one site that turns servers away, its photo
 * too, one that doesn't, and FlareSolverr.
 */
const fetcher: Fetcher = async (url, options = {}) => {
  asked.push({ url, options })
  if (url === `${FLARESOLVERR}/v1`) {
    const body =
      flareSolverr === "solves"
        ? {
            status: "ok",
            solution: {
              url: (options.json as { url: string }).url,
              status: 200,
              response: page("Beef Stew", `${GUARDED}.jpg`),
            },
          }
        : { status: "error", message: "Error solving the challenge." }
    return {
      url,
      status: 200,
      contentType: "application/json",
      body: Buffer.from(JSON.stringify(body)),
    }
  }
  if (url.startsWith(GUARDED)) {
    throw new AppError(
      "upstream",
      "site_refused",
      "That site turned Merran away. Type the recipe in instead."
    )
  }
  if (url === OPEN) {
    return {
      url,
      status: 200,
      contentType: "text/html",
      body: Buffer.from(page("Lentil Soup", `${OPEN}.jpg`)),
    }
  }
  throw new AppError(
    "upstream",
    "site_unreachable",
    "Couldn't reach that site."
  )
}

let app: App
let close: () => Promise<void>
let kyle: TestClient

beforeAll(async () => {
  const test = await createTestApp({ fetcher })
  ;({ app, close } = test)
  kyle = await setUpServer(app, test.setupCode)
})
afterAll(() => close())
beforeEach(() => {
  asked.length = 0
  flareSolverr = "solves"
})

const importLink = (url: string) =>
  kyle.post("/api/recipes/import", { url, force: true })
const askedFlareSolverr = () =>
  asked.filter(({ url }) => url.startsWith(FLARESOLVERR))
const useFlareSolverr = (address: string | null) =>
  kyle.patch("/api/settings/server", { "flaresolverr.url": address })

describe("importing from a site that turns Merran away", () => {
  test("is refused as before without FlareSolverr", async () => {
    const res = await importLink(GUARDED)
    expect(res.status).toBe(502)
    expect((await res.json()).error.message).toMatch(/Type the recipe in/)
    expect(askedFlareSolverr()).toHaveLength(0)
  })

  test("imports the page FlareSolverr's browser saw, once it's set up", async () => {
    expect((await useFlareSolverr(FLARESOLVERR)).status).toBe(200)
    const res = await importLink(GUARDED)
    expect(res.status).toBe(201)
    const { recipe } = await res.json()
    expect(recipe).toMatchObject({ name: "Beef Stew", sourceUrl: GUARDED })

    // Asked once, for the page: the photo was asked for as Merran, and the
    // site turned that away too, so the recipe came in without one.
    expect(askedFlareSolverr()).toHaveLength(1)
    expect(askedFlareSolverr()[0]!.options.json).toMatchObject({
      cmd: "request.get",
      url: GUARDED,
    })
    expect(asked.map(({ url }) => url)).toContain(`${GUARDED}.jpg`)
    expect(recipe.photo).toBeNull()
  })

  test("leaves FlareSolverr alone for sites that answer", async () => {
    expect((await importLink(OPEN)).status).toBe(201)
    expect(askedFlareSolverr()).toHaveLength(0)
  })

  test("says so when FlareSolverr can't get through either", async () => {
    flareSolverr = "fails"
    const res = await importLink(GUARDED)
    expect(res.status).toBe(502)
    expect((await res.json()).error.message).toMatch(
      /even through FlareSolverr. Import it with the browser extension/
    )
    expect((await useFlareSolverr(null)).status).toBe(200)
  })
})
