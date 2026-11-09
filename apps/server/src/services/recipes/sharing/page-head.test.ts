import { load } from "cheerio"
import { describe, expect, it } from "vitest"
import { readRecipeData } from "../import/recipe-data.ts"
import type { SharedRecipe } from "./shared-recipe.ts"
import { previewDescription, sharedPageHead, withHead } from "./page-head.ts"

const INDEX =
  "<!doctype html><html><head><title>Merran</title></head><body></body></html>"
const BASE = "https://merran.example.com"
const TOKEN = "a".repeat(43)
const URL = `${BASE}/r/${TOKEN}`

function sharedRecipe(overrides: Partial<SharedRecipe> = {}): SharedRecipe {
  return {
    name: "Lemon Pasta",
    description: "A bright pasta.",
    servings: 4,
    yieldText: "4 bowls",
    prepMinutes: 10,
    cookMinutes: 80,
    totalMinutes: 90,
    diets: [],
    nutrition: { source: "site", calories: 450, protein: 12, sodium: 300 },
    sourceUrl: null,
    photo: {
      full: `/api/shared/${TOKEN}/photo?size=full&v=1`,
      card: `/api/shared/${TOKEN}/photo?size=card&v=1`,
    },
    ingredients: [
      line("i1", "Sauce", "2 lemons, juiced"),
      line("i2", "Sauce", "1 cup pasta"),
    ],
    steps: [
      { id: "s1", section: "Cook", text: "Boil the pasta." },
      { id: "s2", section: "Cook", text: "Toss with lemon." },
      { id: "s3", section: "Serve", text: "Eat." },
    ],
    household: { name: "The Johnsons" },
    ...overrides,
  }
}

function line(id: string, section: string | null, text: string) {
  return {
    id,
    section,
    text,
    quantity: null,
    quantityMax: null,
    unit: null,
    food: null,
    note: null,
  }
}

describe("a shared recipe's head", () => {
  it("the JSON-LD imports back through Merran's own importer", () => {
    const shared = sharedRecipe()
    const html = withHead(INDEX, sharedPageHead(shared, URL, BASE))
    const data = readRecipeData(html, URL)!

    expect(data.input.name).toBe("Lemon Pasta")
    expect(data.input.ingredients).toEqual(["2 lemons, juiced", "1 cup pasta"])
    expect(data.input.steps.filter((step) => !step.startsWith("#"))).toEqual([
      "Boil the pasta.",
      "Toss with lemon.",
      "Eat.",
    ])
    expect(data.input.servings).toBe(4)
    expect(data.input.yieldText).toBe("4 bowls")
    expect(data.input.prepMinutes).toBe(10)
    expect(data.input.cookMinutes).toBe(80)
    expect(data.input.totalMinutes).toBe(90)
    expect(data.nutrition).toMatchObject({
      calories: 450,
      protein: 12,
      sodium: 300,
    })
    expect(data.photoUrls[0]).toBe(`${BASE}${shared.photo!.full}`)
  })

  it("hostile text can't break out of the head", () => {
    const name = "</script><script>alert(1)</script>"
    const description = `A "quoted" <b>summary</b> & more`
    const html = withHead(
      INDEX,
      sharedPageHead(sharedRecipe({ name, description }), URL, BASE)
    )

    const afterOpening = html.slice(html.indexOf("application/ld+json"))
    expect(afterOpening.match(/<\/script>/g)).toHaveLength(1)
    expect(html).not.toContain("<script>alert")

    const $ = load(html)
    expect($('meta[property="og:title"]').attr("content")).toBe(name)
    expect($('meta[property="og:description"]').attr("content")).toBe(
      description
    )
    expect($("title").text()).toBe(name)
    // The importer reads the JSON as text, not markup, and still finds it.
    expect(readRecipeData(html, URL)).not.toBeNull()
  })

  it("long summaries are cut for previews", () => {
    const description = Array.from(
      { length: 50 },
      (_, i) => `line ${i}\nand more`
    ).join("\n")
    expect(description.length).toBeGreaterThan(500)
    const text = previewDescription(sharedRecipe({ description }))
    expect(text.length).toBeLessThanOrEqual(200)
    expect(text.endsWith("…")).toBe(true)
    expect(text).not.toMatch(/\n/)
  })

  it("falls back to the household's name without a summary", () => {
    expect(previewDescription(sharedRecipe({ description: null }))).toBe(
      "A recipe from The Johnsons"
    )
  })

  it("no photo means a small card and no image", () => {
    const html = withHead(
      INDEX,
      sharedPageHead(sharedRecipe({ photo: null }), URL, BASE)
    )
    const $ = load(html)
    expect($('meta[name="twitter:card"]').attr("content")).toBe("summary")
    expect($('meta[property="og:image"]')).toHaveLength(0)
    expect($('meta[name="robots"]').attr("content")).toBe("noindex")
    expect($('meta[property="og:type"]').attr("content")).toBe("article")
    expect($('meta[property="og:url"]').attr("content")).toBe(URL)
  })

  it("a photo means a large card with an absolute image", () => {
    const $ = load(sharedPageHead(sharedRecipe(), URL, BASE))
    expect($('meta[name="twitter:card"]').attr("content")).toBe(
      "summary_large_image"
    )
    expect($('meta[property="og:image"]').attr("content")).toBe(
      `${BASE}/api/shared/${TOKEN}/photo?size=full&v=1`
    )
  })
})
