import { checkTastes } from "@merran/shared"
import { tool } from "ai"
import { z } from "zod"
import { getTastes } from "../../households/tastes.ts"
import { snapshotOf, totalMinutes } from "../../recipes/recipes.ts"
import { tagsOf } from "../../recipes/tags.ts"
import { lookupRecipe } from "./recipes.ts"
import type { ToolContext } from "./context.ts"

export function getRecipeTool({
  fork,
  householdId,
}: Pick<ToolContext, "fork" | "householdId">) {
  return tool({
    description:
      "One recipe from the library, by its id or name: its lines, steps and notes, and what the household's tastes make of it.",
    inputSchema: z.object({ recipe: z.string() }),
    execute: async ({ recipe: ref }) => {
      const em = fork()
      const recipe = await lookupRecipe(em, ref)
      const tags = (await tagsOf(em, [recipe.id])).get(recipe.id) ?? []
      const input = snapshotOf(recipe, tags)
      const tastes = await getTastes(em, householdId)
      const lines = recipe.ingredients.getItems()
      const check = checkTastes(
        {
          name: recipe.name,
          lines: lines.map((line) => line.rawText),
          marks: lines.map((line) => line.mark ?? null),
          needs: recipe.needs,
        },
        tastes.avoid
      )
      return {
        id: recipe.id,
        name: recipe.name,
        description: input.description,
        servings: input.servings,
        yield: input.yieldText,
        prepMinutes: input.prepMinutes,
        cookMinutes: input.cookMinutes,
        totalMinutes: totalMinutes(recipe),
        tags,
        ingredients: input.ingredients,
        steps: input.steps,
        notes: input.notes,
        rating: recipe.rating ?? null,
        lastMade: recipe.lastMadeAt?.toISOString().slice(0, 10) ?? null,
        doesntSuit: check.ruledOut.map((item) => item.food),
        ...(check.unchecked.length > 0
          ? {
              cantRead:
                "Merran can't read its ingredients to check them, so it may have anything in doesntSuit.",
            }
          : {}),
        leftOut: check.leaveOut.map((item) => ({
          food: item.food,
          for: item.who ?? "the household",
        })),
      }
    },
  })
}
