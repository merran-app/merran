import { z } from "zod"
import { totalMinutes } from "../../recipes/recipes.ts"

export const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A day, as 2026-10-15.")

/** Lines as a recipe's editor holds them: one a line, "# Section" headings. */
const Lines = z.array(z.string())

export const RecipeFields = {
  description: z.string().nullable(),
  servings: z.number().nullable(),
  prepMinutes: z.number().nullable(),
  cookMinutes: z.number().nullable(),
  totalMinutes: z.number().nullable(),
  tags: z.array(z.string()).nullable(),
  ingredients: Lines.nullable().describe(
    'The whole list, one a line, like "1 ½ cups flour, sifted"; "# Sauce" starts a group.'
  ),
  steps: Lines.nullable().describe(
    'The whole list, one step a line, without numbers; "# Sauce" starts a group.'
  ),
  notes: z.string().nullable(),
}
