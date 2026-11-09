import assert from "node:assert/strict"
import { test } from "node:test"

import { asGuestRecipe, type SharedRecipe } from "./guest-recipe.ts"

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde"

const shared: SharedRecipe = {
  name: "Lemon Pasta",
  description: "Bright and quick.",
  servings: 4,
  yieldText: null,
  prepMinutes: 10,
  cookMinutes: 15,
  totalMinutes: 25,
  diets: ["vegetarian"],
  nutrition: null,
  sourceUrl: "https://www.example.com/lemon-pasta",
  photo: null,
  ingredients: [
    {
      id: "i1",
      section: null,
      text: "400 g spaghetti",
      quantity: 400,
      quantityMax: null,
      unit: "gram",
      food: "spaghetti",
      note: null,
    },
    {
      id: "i2",
      section: "Sauce",
      text: "2 lemons",
      quantity: 2,
      quantityMax: null,
      unit: null,
      food: "lemon",
      note: null,
    },
  ],
  steps: [
    { id: "s1", section: null, text: "Boil the pasta for 10 minutes." },
    { id: "s2", section: "Sauce", text: "Zest and squeeze the lemons." },
  ],
  household: { name: "The Johnsons" },
}

test("it keeps the ingredients and steps in order, as written", () => {
  const recipe = asGuestRecipe(shared, TOKEN)

  assert.deepEqual(
    recipe.ingredients.map((line) => [line.id, line.section, line.text]),
    [
      ["i1", null, "400 g spaghetti"],
      ["i2", "Sauce", "2 lemons"],
    ]
  )
  assert.deepEqual(
    recipe.steps.map((step) => [step.id, step.section, step.text]),
    [
      ["s1", null, "Boil the pasta for 10 minutes."],
      ["s2", "Sauce", "Zest and squeeze the lemons."],
    ]
  )
})

test("it keeps what the shared recipe says about itself", () => {
  const recipe = asGuestRecipe(shared, TOKEN)

  assert.equal(recipe.name, "Lemon Pasta")
  assert.equal(recipe.servings, 4)
  assert.equal(recipe.totalMinutes, 25)
  assert.deepEqual(recipe.diets, ["vegetarian"])
  assert.equal(recipe.sourceUrl, "https://www.example.com/lemon-pasta")
})

test("its slug is the link's token", () => {
  assert.equal(asGuestRecipe(shared, TOKEN).slug, TOKEN)
})

test("it leaves the household's own parts empty", () => {
  const recipe = asGuestRecipe(shared, TOKEN)

  assert.equal(recipe.rating, null)
  assert.deepEqual(recipe.tags, [])
  assert.deepEqual(recipe.needs, [])
  assert.equal(recipe.notes, null)
  assert.equal(recipe.lastMadeAt, null)
  assert.ok(recipe.ingredients.every((line) => line.mark === null))
})
