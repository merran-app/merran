import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
  Household,
  Recipe,
  SiteRecipe,
} from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { forHousehold } from "../../../database/scope.ts"
import { createTestDatabase } from "../../../test/database.ts"
import { fitsTheme, shelfMatches, themeWords } from "./shelf-matches.ts"

let database: Database
let close: () => Promise<void>
let home: string

const DAY = 24 * 60 * 60_000

/** A shelf recipe, posted this many days ago. */
function row(
  name: string,
  daysAgo: number,
  more: Partial<SiteRecipe> = {}
): Partial<SiteRecipe> {
  return {
    url: `https://example.com/${name.toLowerCase().replace(/\W+/g, "-")}`,
    state: "recipe",
    siteName: "Example",
    name,
    description: null,
    courses: ["soup"],
    keywords: [],
    ingredients: ["1 cup water"],
    diets: [],
    publishedAt: new Date(Date.now() - daysAgo * DAY),
    ...more,
  }
}

beforeAll(async () => {
  ;({ database, close } = await createTestDatabase())
  const em = database.em.fork()
  const household = em.create(Household, {
    name: "Home",
    slug: "home",
    settings: {
      tastes: {
        avoid: [{ food: "peanut", level: "allergy", who: null }],
        diets: [],
        weeknightMinutes: 30,
      },
    },
  })
  const shelf = [
    row("Lemon Chickpea Soup", 1, {
      description: "Jump to recipe! a bright, lemony soup.",
      photoUrl: "https://example.com/lemon.jpg",
      photo: "shelf/lemon.webp",
    }),
    row("Peanut Noodle Soup", 2, {
      ingredients: ["2 tbsp peanut butter", "noodles"],
    }),
    row("Tomato Basil Soup", 3),
    row("Easy Tomato Basil Soup", 4),
    row("Minestrone Soup", 5),
    row("Leek Potato Soup", 6),
    row("Beef Stew", 0, { courses: ["main"] }),
    row("Pending Soup", 0, { state: "waiting" }),
  ]
  for (const data of shelf) em.create(SiteRecipe, data as never)
  // Leek Potato Soup is in the library already.
  em.create(Recipe, {
    household,
    slug: "leek-potato-soup",
    name: "Leek Potato Soup",
    origin: "link",
    sourceUrl: "https://example.com/leek-potato-soup",
  })
  await em.flush()
  home = household.id
})

afterAll(() => close())

const em = () => forHousehold(database.em, home)

describe("a theme's words", () => {
  test("leaves out moods, seasons and filler", () => {
    expect(themeWords("Cozy fall soups")).toEqual(["soups"])
    expect(themeWords("Quick weeknight pasta")).toEqual(["pasta"])
    expect(themeWords("Sheet-pan dinners")).toEqual(["sheet", "pan", "dinners"])
    expect(themeWords("Something new with chicken")).toEqual(["chicken"])
    expect(themeWords("Hearty vegetarian mains")).toEqual([
      "vegetarian",
      "mains",
    ])
    expect(themeWords("Gluten-free cookies")).toEqual([
      "gluten-free",
      "cookies",
    ])
    expect(themeWords("something cozy")).toEqual([])
  })

  test("fit a recipe by its name, keywords, course or diets", () => {
    const soup = {
      name: "Lentil Soup",
      keywords: ["lentils"],
      courses: ["soup"],
      diets: ["vegan", "vegetarian"],
    }
    expect(fitsTheme(["soups"], soup)).toBe(true)
    expect(fitsTheme(["vegetarian", "soups"], soup)).toBe(true)
    expect(fitsTheme(["chicken"], soup)).toBe(false)
    expect(
      fitsTheme(["sauces"], { ...soup, name: "Green Sauce", courses: [] })
    ).toBe(true)
    expect(
      fitsTheme(["tomatoes"], { ...soup, name: "Tomato Tart", courses: [] })
    ).toBe(true)
    expect(
      fitsTheme(["dinners"], { ...soup, name: "Gnocchi", courses: ["main"] })
    ).toBe(true)
    expect(fitsTheme([], soup)).toBe(false)
  })
})

describe("shelf matches", () => {
  test("finds up to four that suit the household, newest first", async () => {
    const found = await shelfMatches(em(), home, "Cozy fall soups", {
      avoid: [],
      skip: [],
    })
    // The peanut soup, the one in the library, the second take on tomato
    // basil, the stew and the unopened post are all left out.
    expect(found.map((recipe) => recipe.name)).toEqual([
      "Lemon Chickpea Soup",
      "Tomato Basil Soup",
      "Minestrone Soup",
    ])
    expect(found[0]).toMatchObject({
      shelfId: expect.any(String),
      photoKey: null,
      photo: expect.stringMatching(/^\/api\/sites\/recipes\/.+\/photo$/),
      why: "A bright, lemony soup.",
      site: "Example",
    })
    expect(found[1]).toMatchObject({ photo: null, why: "" })
  })

  test("stops at four", async () => {
    const found = await shelfMatches(em(), home, "soups", {
      avoid: [],
      skip: [],
    })
    expect(found.length).toBeLessThanOrEqual(4)
  })

  test("leaves out links in the search, and dishes it's told to avoid", async () => {
    const found = await shelfMatches(em(), home, "soups", {
      avoid: ["Easy Minestrone Soup"],
      skip: ["https://example.com/lemon-chickpea-soup"],
    })
    expect(found.map((recipe) => recipe.name)).toEqual(["Tomato Basil Soup"])
  })

  test("finds nothing for a theme of only moods", async () => {
    expect(
      await shelfMatches(em(), home, "something cozy", { avoid: [], skip: [] })
    ).toEqual([])
  })
})
