import { describe, expect, test } from "vitest"
import type { LiveArea } from "../../services/events/events.ts"
import { areasFor } from "./live.ts"

const EVERYWHERE_A_RECIPE_SHOWS: LiveArea[] = [
  "recipes",
  "plan",
  "list",
  "pantry",
]

describe("the areas a recipe write changes", () => {
  const cases: [string, string, LiveArea[]][] = [
    ["a new recipe", "/api/recipes", ["recipes"]],
    ["an import", "/api/recipes/import", ["recipes"]],
    ["finding links in text", "/api/recipes/import/links/check", []],
    ["asking for stand-ins", "/api/recipes/abc/stand-ins", []],
    ["a recipe's nutrition", "/api/recipes/abc/nutrition", ["recipes", "plan"]],
    ["the library nutrition run", "/api/recipes/nutrition", ["recipes"]],
    [
      "stopping the library nutrition run",
      "/api/recipes/nutrition/run1/stop",
      ["recipes"],
    ],
    ["an edit", "/api/recipes/abc", EVERYWHERE_A_RECIPE_SHOWS],
    [
      "making a photo",
      "/api/recipes/abc/photo/make",
      EVERYWHERE_A_RECIPE_SHOWS,
    ],
    [
      "restoring a version",
      "/api/recipes/abc/versions/v1/restore",
      EVERYWHERE_A_RECIPE_SHOWS,
    ],
    ["Made it", "/api/recipes/abc/made", EVERYWHERE_A_RECIPE_SHOWS],
    ["a bulk change", "/api/recipes/bulk", EVERYWHERE_A_RECIPE_SHOWS],
    [
      "restoring a deleted recipe",
      "/api/recipes/deleted/abc/restore",
      EVERYWHERE_A_RECIPE_SHOWS,
    ],
    ["a rating", "/api/recipes/abc/rating", ["recipes"]],
    ["a cook note", "/api/recipes/abc/cook-notes/n1", ["recipes"]],
    ["a tag", "/api/recipes/tags/t1", ["recipes"]],
    ["the photos run", "/api/recipes/photos", ["recipes"]],
    ["stopping the tidy run", "/api/recipes/tidy/run1/stop", ["recipes"]],
  ]

  test.each(cases)("%s: %s", (_what, path, areas) => {
    expect(areasFor(path)).toEqual(areas)
  })

  test("other paths keep their own rules", () => {
    expect(areasFor("/api/pantry/items")).toEqual(["pantry"])
    expect(areasFor("/api/unknown")).toEqual([])
  })
})
