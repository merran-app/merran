import { describe, expect, test } from "vitest"
import { sameDish } from "./dishes.ts"

describe("Discover's picks", () => {
  test("knows two takes on one dish", () => {
    expect(
      sameDish("Sheet Pan Chicken Fajitas", "Easy Sheet Pan Chicken Fajitas")
    ).toBe(true)
    expect(
      sameDish(
        "5-Ingredient Honey Garlic Glazed Salmon",
        "Easy Honey Garlic Salmon"
      )
    ).toBe(true)
    expect(sameDish("Honey Garlic Chicken", "Honey Garlic Salmon")).toBe(false)
    expect(sameDish("Chicken Fajitas", "Steak Fajitas")).toBe(false)
  })
})
