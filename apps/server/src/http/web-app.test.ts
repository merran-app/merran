import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pino } from "pino"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import * as shares from "../services/recipes/sharing/shares.ts"
import { createTestApp, setUpServer, type TestClient } from "../test/app.ts"
import { handleNotFound } from "./errors.ts"
import { createRouter } from "./router.ts"
import { serveWebApp } from "./web-app.ts"

const logger = pino({ level: "silent" })
const dir = mkdtempSync(join(tmpdir(), "merran-web-"))
mkdirSync(join(dir, "assets"))
writeFileSync(join(dir, "index.html"), "<!doctype html><title>Merran</title>")
writeFileSync(join(dir, "assets", "app-1a2b.js"), "console.log('hi')")
writeFileSync(join(dir, "favicon.svg"), "<svg/>")

afterAll(() => rmSync(dir, { recursive: true, force: true }))

function createApp(webDir: string) {
  const app = createRouter()
  app.get("/api/health", (c) => c.json({ ok: true }))
  serveWebApp(app, webDir, logger, null)
  app.notFound(handleNotFound)
  return app
}

describe("the web app", () => {
  const app = createApp(dir)

  it("serves the page for any path the app's router handles", async () => {
    for (const path of ["/", "/recipes", "/settings/profile", "/join/abc"]) {
      const res = await app.request(path)
      expect(res.status, path).toBe(200)
      expect(res.headers.get("content-type")).toContain("text/html")
      expect(res.headers.get("cache-control")).toBe("no-cache")
      expect(await res.text()).toContain("<title>Merran</title>")
    }
  })

  it("serves built files, caching assets for good", async () => {
    const asset = await app.request("/assets/app-1a2b.js")
    expect(asset.status).toBe(200)
    expect(asset.headers.get("cache-control")).toContain("immutable")
    expect(await asset.text()).toBe("console.log('hi')")

    const icon = await app.request("/favicon.svg")
    expect(icon.status).toBe(200)
    expect(icon.headers.get("cache-control")).toBeNull()
  })

  it("leaves the API alone", async () => {
    expect(await (await app.request("/api/health")).json()).toEqual({
      ok: true,
    })
    const missing = await app.request("/api/nothing-here")
    expect(missing.status).toBe(404)
    expect(await missing.json()).toMatchObject({
      error: { code: "not_found" },
    })
  })

  it("gives a 404 for a missing asset, not the page", async () => {
    const res = await app.request("/assets/gone.js")
    expect(res.status).toBe(404)
    expect(res.headers.get("content-type")).toContain("application/json")
  })

  it("takes a share without the service worker on to the share page", async () => {
    const shareForm = (fields: Record<string, string | File>) => {
      const form = new FormData()
      for (const [key, value] of Object.entries(fields)) form.append(key, value)
      return app.request("/share", { method: "POST", body: form })
    }

    const text = await shareForm({
      title: "Lemon Chicken",
      text: " https://example.com/lemon-chicken ",
      file: new File([], ""),
    })
    expect(text.status).toBe(303)
    const to = new URL(text.headers.get("location")!, "http://merran.test")
    expect(to.pathname).toBe("/share")
    expect(Object.fromEntries(to.searchParams)).toEqual({
      title: "Lemon Chicken",
      text: "https://example.com/lemon-chicken",
    })

    // Its photos can't be kept: the page says so.
    const photo = await shareForm({
      file: new File([new Uint8Array([0xff, 0xd8, 0xff])], "receipt.jpg", {
        type: "image/jpeg",
      }),
    })
    expect(photo.status).toBe(303)
    expect(photo.headers.get("location")).toBe("/share?lost=1")
  })

  it("doesn't escape its folder", async () => {
    const res = await app.request("/..%2f..%2fetc/passwd")
    expect(await res.text()).not.toContain("root:")
  })
})

describe("without a built web app", () => {
  it("serves only the API", async () => {
    const app = createApp(join(dir, "not-built"))
    expect((await app.request("/api/health")).status).toBe(200)
    expect((await app.request("/")).status).toBe(404)
  })
})

describe("a shared recipe's page", () => {
  let owner: TestClient
  let app: Awaited<ReturnType<typeof createTestApp>>["app"]
  let close: () => Promise<void>
  let token: string

  const metaContent = (html: string, property: string) =>
    new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)"`).exec(
      html
    )?.[1]

  beforeAll(async () => {
    const testApp = await createTestApp({ webDir: dir })
    ;({ app, close } = testApp)
    owner = await setUpServer(app, testApp.setupCode)
    const created = await owner.post("/api/recipes", {
      name: "Lemon Pasta",
      servings: 4,
      ingredients: ["1 cup pasta"],
      steps: ["Boil the pasta."],
    })
    const { slug } = (await created.json()) as { slug: string }
    const shared = await owner.post(`/api/recipes/${slug}/share`)
    const { url } = (await shared.json()) as { url: string }
    token = url.split("/r/")[1]!
  })

  afterAll(() => close())

  it("has the recipe's name and data in its head", async () => {
    for (const path of [`/r/${token}`, `/r/${token}/cook`]) {
      const res = await app.request(path)
      expect(res.status, path).toBe(200)
      expect(res.headers.get("cache-control")).toBe("private, no-cache")
      expect(res.headers.get("referrer-policy")).toBe("no-referrer")
      const html = await res.text()
      expect(metaContent(html, "og:title")).toBe("Lemon Pasta")
      expect(html).toContain("application/ld+json")
      expect(html).not.toContain("<title>Merran</title>")
    }
  })

  it("doesn't count a preview bot's fetch as the link being opened", async () => {
    const openedAt = async () => {
      const res = await owner.get("/api/households/current/shares")
      const { shares } = (await res.json()) as {
        shares: { openedAt: string | null }[]
      }
      return shares[0]!.openedAt
    }
    expect(await openedAt()).toBeNull()
    await app.request(`/r/${token}`)
    expect(await openedAt()).toBeNull()
  })

  it("serves the plain page when the lookup fails", async () => {
    const spy = vi
      .spyOn(shares, "sharedForToken")
      .mockRejectedValueOnce(new Error("database is locked"))
    try {
      const res = await app.request(`/r/${token}`)
      expect(res.status).toBe(200)
      expect(res.headers.get("cache-control")).toBe("no-cache")
      expect(await res.text()).toBe("<!doctype html><title>Merran</title>")
    } finally {
      spy.mockRestore()
    }
  })

  it("leaves other pages and unknown links as they are", async () => {
    for (const path of [`/r/${"b".repeat(43)}`, "/r/short", "/recipes/x"]) {
      const res = await app.request(path)
      expect(res.status, path).toBe(200)
      expect(await res.text(), path).toBe(
        "<!doctype html><title>Merran</title>"
      )
    }
  })
})

describe("a shared recipe's page without a public URL", () => {
  it("is the page unchanged", async () => {
    const testApp = await createTestApp({ webDir: dir, publicUrl: null })
    try {
      const res = await testApp.app.request(`/r/${"b".repeat(43)}`)
      expect(await res.text()).toBe("<!doctype html><title>Merran</title>")
    } finally {
      await testApp.close()
    }
  })
})
