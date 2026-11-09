import { toNumber } from "../../../database/numbers.ts"
import type { Recipe } from "../../../database/entities/index.ts"
import { decodeDiets } from "../diet-labels.ts"
import { totalMinutes } from "../recipes.ts"

/**
 * A recipe as anyone with its link sees it. Every field is set by hand, never
 * spread from the full recipe, so a field added to recipes later stays private
 * until someone decides to share it here. Lines get ids from their place in
 * the list, so no database id leaves the server.
 */
export function describeShared(
  recipe: Recipe,
  householdName: string,
  token: string
) {
  const photo = (size: "full" | "card") =>
    `/api/shared/${token}/photo?size=${size}&v=${recipe.image}`

  return {
    name: recipe.name,
    description: recipe.description ?? null,
    servings: toNumber(recipe.servings),
    yieldText: recipe.yieldText ?? null,
    prepMinutes: recipe.prepMinutes ?? null,
    cookMinutes: recipe.cookMinutes ?? null,
    totalMinutes: totalMinutes(recipe),
    diets: decodeDiets(recipe.diets),
    nutrition: recipe.nutrition ?? null,
    sourceUrl: recipe.sourceUrl ?? null,
    photo: recipe.image ? { full: photo("full"), card: photo("card") } : null,
    ingredients: recipe.ingredients.getItems().map((line, index) => ({
      id: `i${index + 1}`,
      section: line.section ?? null,
      text: line.rawText,
      quantity: toNumber(line.quantity),
      quantityMax: toNumber(line.quantityMax),
      unit: line.unit ?? null,
      food: line.food ?? null,
      note: line.note ?? null,
    })),
    steps: recipe.steps.getItems().map((step, index) => ({
      id: `s${index + 1}`,
      section: step.section ?? null,
      text: step.text,
    })),
    household: { name: householdName },
  }
}
