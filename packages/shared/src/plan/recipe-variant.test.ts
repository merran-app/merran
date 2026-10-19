import { expect, test } from "vitest"
import { swapMealIngredient, type MealRecipe } from "./recipe-variant.ts"

const recipe: MealRecipe = {
  recipeId: "dish",
  name: "Dinner",
  servings: 4,
  basedOn: "revision",
  needs: [],
  ingredients: [
    {
      id: "broccoli",
      section: "Vegetables",
      text: "2 cups broccoli",
      quantity: 2,
      quantityMax: null,
      unit: "cup",
      food: "broccoli",
      foodKey: "broccoli",
      note: null,
      mark: "swappable",
    },
    {
      id: "onion",
      section: null,
      text: "1 onion",
      quantity: 1,
      quantityMax: null,
      unit: null,
      food: "onion",
      note: null,
      mark: null,
    },
  ],
  steps: [{ id: "cook", section: null, text: "Cook the broccoli and onion." }],
}
test("planned substitutions preserve the source and update quantities, sections and cooking names", () => {
  const changed = swapMealIngredient(
    recipe,
    "broccoli",
    ["1 cup peas", "1 cup green beans"],
    []
  )
  expect(recipe.ingredients[0]!.text).toBe("2 cups broccoli")
  expect(changed.ingredients.map((line) => line.text)).toEqual([
    "1 cup peas",
    "1 cup green beans",
    "1 onion",
  ])
  expect(changed.ingredients[0]).toMatchObject({
    section: "Vegetables",
    mark: "swappable",
    quantity: 1,
    foodKey: null,
  })
  expect(changed.steps[0]!.text).toContain("peas and green beans")
  expect(changed.steps[0]!.text).toContain("onion")
})
test("an explicit rewritten step wins over automatic renaming", () => {
  const changed = swapMealIngredient(
    recipe,
    "broccoli",
    ["1 cup peas"],
    [{ stepId: "cook", text: "Add the peas for the last two minutes." }]
  )
  expect(changed.steps[0]!.text).toBe("Add the peas for the last two minutes.")
})
test("a saved substitute can be substituted again without reverting other edits", () => {
  const first = swapMealIngredient(recipe, "broccoli", ["1 cup peas"], [])
  const second = swapMealIngredient(
    first,
    first.ingredients[0]!.id,
    ["1 cup zucchini"],
    []
  )
  expect(second.steps[0]!.text).toContain("zucchini")
  expect(second.ingredients[1]).toEqual(recipe.ingredients[1])
})
