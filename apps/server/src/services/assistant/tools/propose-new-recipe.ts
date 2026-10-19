import { tool } from "ai"
import { z } from "zod"
import { AppError } from "../../../core/errors.ts"
import { RecipeInputSchema } from "../../../http/schemas/recipes.ts"
import { totalMinutes } from "../../recipes/recipes.ts"
import { cleanLines } from "../../proposals/text.ts"
import { RecipeFields } from "./schemas.ts"
import type { ToolContext } from "./context.ts"

export function proposeNewRecipeTool({
  fork,
  propose,
}: Pick<ToolContext, "fork" | "propose">) {
  return tool({
    description:
      "Suggest a new recipe from the conversation, written out in full. It's a card they save to the library.",
    inputSchema: z.object({
      summary: z.string().describe("What it is, in a short sentence."),
      name: z.string(),
      ...RecipeFields,
    }),
    execute: async ({ summary, name, ...fields }) => {
      const em = fork()
      const parsed = RecipeInputSchema.safeParse({
        name,
        description: fields.description,
        servings: fields.servings,
        prepMinutes: fields.prepMinutes && Math.round(fields.prepMinutes),
        cookMinutes: fields.cookMinutes && Math.round(fields.cookMinutes),
        totalMinutes: fields.totalMinutes && Math.round(fields.totalMinutes),
        notes: fields.notes,
        tags: fields.tags ?? [],
        ingredients: cleanLines(fields.ingredients ?? [], 300, 500),
        steps: cleanLines(fields.steps ?? [], 200, 5000),
      })
      if (!parsed.success) {
        throw new AppError(
          "invalid",
          "invalid_recipe",
          `That recipe can't be saved: ${parsed.error.issues[0]?.message ?? "something's off"}`
        )
      }
      return propose({
        kind: "recipe",
        summary,
        payload: { recipe: parsed.data },
      })
    },
  })
}
