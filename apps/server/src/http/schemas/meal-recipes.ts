import { z } from "@hono/zod-openapi"
import { IngredientSchema, StepSchema } from "./recipes.ts"

export const MealRecipeSchema = z
  .object({
    recipeId: z.string(),
    name: z.string().max(500),
    servings: z.number().positive().nullable(),
    basedOn: z.string(),
    needs: z.array(z.string()).max(100),
    ingredients: z
      .array(
        IngredientSchema.extend({ foodKey: z.string().nullable().optional() })
      )
      .max(500),
    steps: z.array(StepSchema).max(500),
  })
  .openapi("MealRecipe", {
    description:
      "Ingredients and instructions saved for one planned meal; the library recipe stays separate. Nutrition must be recalculated for substitutions.",
  })
