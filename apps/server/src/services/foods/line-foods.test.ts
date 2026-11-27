import { lineFoods } from "@merran/shared"
import { expect, test } from "vitest"
import { lineFoodsOf } from "./line-foods.ts"

test("a line's foods are worked out once and kept", () => {
  const first = lineFoodsOf("2 cups chopped onion")
  expect(lineFoodsOf("2 cups chopped onion")).toBe(first)
  expect(first).toEqual(lineFoods("2 cups chopped onion"))
})

test("what's kept can't be changed by a caller", () => {
  const foods = lineFoodsOf("salt and pepper")
  expect(Object.isFrozen(foods)).toBe(true)
  expect(foods.every((food) => Object.isFrozen(food))).toBe(true)
})
