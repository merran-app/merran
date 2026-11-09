// Only types are imported here, so node's test runner can load this file.
import type { Schemas } from "@/lib/api/client"
import type { Recipe } from "@/features/recipes/queries"

/** A recipe as its shared link gives it to anyone holding the link. */
export type SharedRecipe = Schemas["SharedRecipe"]

/** The shared recipe has no dates of its own; nothing a guest sees shows one. */
const NO_DATE = new Date(0).toISOString()

/**
 * A shared recipe as a whole `Recipe`, so the recipe page's parts and the
 * cook view take it as they are. What only the household has (its rating,
 * tags, notes, needs and marks) is left empty, and the token stands in for
 * the id and slug, since the recipe's own aren't shared.
 */
export function asGuestRecipe(shared: SharedRecipe, token: string): Recipe {
  return {
    id: token,
    slug: token,
    name: shared.name,
    description: shared.description,
    servings: shared.servings,
    yieldText: shared.yieldText,
    prepMinutes: shared.prepMinutes,
    cookMinutes: shared.cookMinutes,
    totalMinutes: shared.totalMinutes,
    diets: shared.diets,
    nutrition: shared.nutrition,
    sourceUrl: shared.sourceUrl,
    photo: shared.photo,
    photoByAi: false,
    origin: "merran",
    rating: null,
    tags: [],
    notes: null,
    needs: [],
    dietOverrides: {},
    lastMadeAt: null,
    createdAt: NO_DATE,
    updatedAt: NO_DATE,
    ingredients: shared.ingredients.map((line) => ({ ...line, mark: null })),
    steps: shared.steps.map((step) => ({ ...step })),
  }
}
