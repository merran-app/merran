import { describe, expect, test } from "vitest"
import {
  duplicateReasons,
  findDuplicatePairs,
  linkKey,
  nameWords,
  type DuplicateCandidate,
} from "./duplicates.ts"

describe("linkKey", () => {
  test("one page under any address", () => {
    const addresses = [
      "https://www.example.com/lemon-chicken/?utm_source=x",
      "http://example.com/lemon-chicken",
      "https://example.com/lemon-chicken/print/",
      "https://amp.example.com/lemon-chicken/amp",
    ]
    for (const address of addresses) {
      expect(linkKey(address)).toBe("example.com/lemon-chicken")
    }
  })

  test("another page or another post is another key", () => {
    expect(linkKey("https://example.com/lemon-cake")).not.toBe(
      linkKey("https://example.com/lemon-chicken")
    )
    expect(linkKey("https://example.com/?p=12")).not.toBe(
      linkKey("https://example.com/?p=13")
    )
  })

  test("keeps parameters that aren't tracking, in order", () => {
    expect(linkKey("https://example.com/r?b=2&a=1&fbclid=z")).toBe(
      "example.com/r?a=1&b=2"
    )
  })

  test("has none for what isn't a web link", () => {
    expect(linkKey("ftp://example.com/x")).toBeNull()
    expect(linkKey("not a link")).toBeNull()
    expect(linkKey("")).toBeNull()
  })
})

describe("nameWords", () => {
  test("the same for order, case, accents, filler and plurals", () => {
    const lemonChicken = new Set(["lemon", "chicken"])
    expect(nameWords("Easy Lemon Chickens")).toEqual(lemonChicken)
    expect(nameWords("The chicken with lemon")).toEqual(lemonChicken)
    expect(nameWords("Crème Brûlée")).toEqual(new Set(["creme", "brulee"]))
  })

  test("singular words, carefully", () => {
    expect(nameWords("Tomatoes")).toEqual(new Set(["tomato"]))
    expect(nameWords("Cookies")).toEqual(new Set(["cooky"]))
    expect(nameWords("Dishes")).toEqual(new Set(["dish"]))
    expect(nameWords("Ribs")).toEqual(new Set(["rib"]))
    expect(nameWords("Hummus")).toEqual(new Set(["hummus"]))
    expect(nameWords("Glass")).toEqual(new Set(["glass"]))
    expect(nameWords("Couscous")).toEqual(new Set(["couscous"]))
  })

  test("is empty for a name that's all filler", () => {
    expect(nameWords("Recipe").size).toBe(0)
    expect(nameWords("The Best Easy Recipe").size).toBe(0)
  })

  test("keeps the marks other scripts spell with", () => {
    // Dal and dil differ only in a vowel sign, which isn't an accent.
    expect(nameWords("दाल मखनी")).toEqual(new Set(["दाल", "मखनी"]))
    expect(nameWords("दाल मखनी")).not.toEqual(nameWords("दिल मखनी"))
    expect(nameWords("鶏の唐揚げ")).toEqual(new Set(["鶏の唐揚げ"]))
  })
})

describe("duplicateReasons", () => {
  const recipe = (
    name: string,
    sourceUrl: string | null = null,
    foods: string[] = []
  ): DuplicateCandidate => ({ name, sourceUrl, foods })
  const LINK = "https://example.com/lemon-chicken"

  test("same link", () => {
    expect(
      duplicateReasons(
        recipe("Lemon Chicken", LINK),
        recipe("Roast Thighs", "http://www.example.com/lemon-chicken/")
      )
    ).toEqual(["link"])
  })

  test("same name words", () => {
    expect(
      duplicateReasons(recipe("Lemon Chicken"), recipe("Chicken with Lemon"))
    ).toEqual(["name"])
  })

  test("both, in order", () => {
    expect(
      duplicateReasons(
        recipe("Lemon Chicken", LINK),
        recipe("Easy Lemon Chicken", `${LINK}/print`)
      )
    ).toEqual(["link", "name"])
  })

  test("a name inside another, with most foods shared", () => {
    expect(
      duplicateReasons(
        recipe("Lemon Chicken", null, ["chicken", "lemon", "garlic", "salt"]),
        recipe("Sticky Lemon Chicken", null, [
          "chicken",
          "lemon",
          "garlic",
          "honey",
          "soy sauce",
        ])
      )
    ).toEqual(["name"])
  })

  test("not with too few foods shared", () => {
    expect(
      duplicateReasons(
        recipe("Lemon Chicken", null, ["chicken", "lemon", "rice", "salt"]),
        recipe("Sticky Lemon Chicken", null, [
          "chicken",
          "lemon",
          "garlic",
          "honey",
        ])
      )
    ).toEqual([])
  })

  test("not when the shared foods are too small a part", () => {
    expect(
      duplicateReasons(
        recipe("Lemon Chicken", null, [
          "chicken",
          "lemon",
          "garlic",
          "rice",
          "salt",
        ]),
        recipe("Sticky Lemon Chicken", null, [
          "chicken",
          "lemon",
          "garlic",
          "honey",
          "soy sauce",
          "sesame",
        ])
      )
    ).toEqual([])
  })

  test("not without foods", () => {
    expect(
      duplicateReasons(recipe("Chili"), recipe("White Chicken Chili"))
    ).toEqual([])
  })

  test("not for names with nothing in common", () => {
    expect(
      duplicateReasons(recipe("Lemon Chicken"), recipe("Tomato Soup"))
    ).toEqual([])
  })

  test("never by an empty name", () => {
    expect(duplicateReasons(recipe("Recipe"), recipe("The Recipe"))).toEqual([])
  })

  test("a link that can't be read still matches by name", () => {
    expect(
      duplicateReasons(
        recipe("Lemon Chicken", "nonsense"),
        recipe("Lemon Chicken", "nonsense")
      )
    ).toEqual(["name"])
  })
})

describe("findDuplicatePairs", () => {
  const recipe = (
    id: string,
    name: string,
    sourceUrl: string | null = null
  ) => ({
    id,
    name,
    sourceUrl,
    foods: [],
  })

  test("each pair once, earlier first", () => {
    expect(
      findDuplicatePairs([
        recipe("1", "Lemon Chicken"),
        recipe("2", "Tomato Soup"),
        recipe("3", "Chicken with Lemon"),
      ])
    ).toEqual([{ a: "1", b: "3", reasons: ["name"] }])
  })

  test("three copies make three pairs", () => {
    expect(
      findDuplicatePairs([
        recipe("1", "Lemon Chicken"),
        recipe("2", "Lemon Chicken"),
        recipe("3", "Lemon Chicken"),
      ])
    ).toHaveLength(3)
  })

  test("none in a library without any", () => {
    expect(
      findDuplicatePairs([
        recipe("1", "Lemon Chicken"),
        recipe("2", "Tomato Soup"),
      ])
    ).toEqual([])
  })

  test("a big library doesn't compare every pair", () => {
    const library = Array.from({ length: 2000 }, (_, i) => ({
      id: String(i),
      name: `Dish ${i}`,
      sourceUrl: `https://example.com/dish-${i}`,
      foods: [`food ${i}`, `spice ${i}`, `herb ${i}`],
    }))
    const started = Date.now()
    expect(findDuplicatePairs(library)).toEqual([])
    expect(Date.now() - started).toBeLessThan(500)
  })
})
