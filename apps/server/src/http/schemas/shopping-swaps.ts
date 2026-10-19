import { z } from "@hono/zod-openapi"
import { MealRecipeSchema } from "./meal-recipes.ts"
import { ListItemSnapshotSchema } from "./list.ts"
import { SaveSwapInputSchema, SwapSchema } from "./swaps.ts"
import { IDS, RECIPE, TIMES } from "./examples.ts"

const CONTEXT = {
  mealId: IDS.planEntry,
  mealName: RECIPE.name,
  date: "2026-10-15",
  anyDay: false,
  revision: TIMES.now,
  recipe: {
    recipeId: IDS.lemonChicken,
    name: RECIPE.name,
    servings: 4,
    basedOn: TIMES.now,
    needs: [],
    ingredients: RECIPE.ingredients,
    steps: RECIPE.steps,
  },
  ingredientId: IDS.ingredients[0],
  factor: 1,
  state: "example-state",
  canSaveToLibrary: true,
}
const UNDO = {
  listId: IDS.shoppingList,
  meals: [{ mealId: IDS.planEntry, expected: TIMES.now, variants: [] }],
  library: null,
  manual: null,
}

export const ShoppingReplacementSchema = SaveSwapInputSchema.extend({
  recipeId: z.string(),
  state: z.string(),
})

export const ShoppingSwapsSchema = z
  .object({
    swaps: z.array(
      SwapSchema.extend({
        replacements: z.array(ShoppingReplacementSchema).optional(),
      })
    ),
  })
  .openapi("ShoppingSwaps", { example: { swaps: [] } })

export const ShoppingTargetsSchema = z
  .object({
    targets: z.array(
      z.object({
        mealId: z.string(),
        mealName: z.string(),
        date: z.string(),
        anyDay: z.boolean(),
        revision: z.string(),
        recipe: MealRecipeSchema,
        ingredientId: z.string(),
        factor: z.number(),
        state: z.string(),
        canSaveToLibrary: z.boolean(),
      })
    ),
  })
  .openapi("ShoppingSwapTargets", { example: { targets: [CONTEXT] } })

export const ShoppingSwapInputSchema = SaveSwapInputSchema.extend({
  recipeId: z.string().optional(),
  state: z.string().optional(),
  targets: z
    .array(
      z.object({
        mealId: z.uuid(),
        revision: z.string(),
        replacement: ShoppingReplacementSchema.optional(),
      })
    )
    .max(100),
  saveToLibrary: z.boolean().default(false),
}).openapi("ShoppingSwapInput", {
  description:
    "Select linked planned meals. Each target may supply its own recipe, ingredient, state, lines and steps to replace a shared food across different recipes atomically. Without replacement, the top-level fields apply. With no targets, replace one manually added item using one ingredient line. Amounts are for each recipe as written. Saving to the library is explicit and restricted to a single recipe context.",
  example: {
    recipeId: IDS.lemonChicken,
    ingredientId: IDS.ingredients[0],
    state: "example-state",
    targets: [{ mealId: IDS.planEntry, revision: TIMES.now }],
    lines: ["2 tbsp butter"],
    steps: [],
    saveToLibrary: false,
  },
})

export const ShoppingUndoSchema = z
  .object({
    listId: z.string().optional(),
    meals: z
      .array(
        z.object({
          mealId: z.string(),
          expected: z.string(),
          variants: z.array(MealRecipeSchema),
        })
      )
      .max(100),
    library: z
      .object({
        recipeId: z.string(),
        versionId: z.string(),
        expected: z.string(),
      })
      .nullable(),
    manual: z
      .object({ snapshot: ListItemSnapshotSchema, expected: z.string() })
      .nullable(),
  })
  .openapi("ShoppingSwapUndo", { example: UNDO })
export const ShoppingSwapResultSchema = z
  .object({ undo: ShoppingUndoSchema })
  .openapi("ShoppingSwapResult", { example: { undo: UNDO } })
