import {
  avoidedIn,
  canRead,
  dietsFor,
  foodKey,
  missingDiets,
  parseIngredient,
} from "@merran/shared"
import { tool } from "ai"
import { z } from "zod"
import { AppError } from "../../../core/errors.ts"
import { getTastes } from "../../households/tastes.ts"
import { cleanLines } from "../../proposals/text.ts"
import { lookupRecipe } from "./recipes.ts"
import type { ToolContext } from "./context.ts"

export function proposeSwapTool({
  fork,
  householdId,
  propose,
}: Pick<ToolContext, "fork" | "householdId" | "propose">) {
  return tool({
    description:
      "Offer a stand-in for one of a recipe's ingredients, for someone out of it or who doesn't eat it: lines with amounts for the recipe as written, how it changes the dish, and any steps it changes. It's a card they use this time, or save to the recipe.",
    inputSchema: z.object({
      recipe: z.string().describe("Its id or name."),
      ingredient: z
        .string()
        .describe("The line it stands in for, as the recipe has it."),
      lines: z
        .array(z.string())
        .min(1)
        .max(5)
        .describe('The stand-in: "1 cup milk", "1 tbsp lemon juice".'),
      note: z
        .string()
        .describe("How to use it and how it changes the dish, in a sentence."),
      steps: z
        .array(z.object({ step: z.number(), text: z.string() }))
        .describe(
          'Steps it changes, by number (counting steps only, not "# " lines), rewritten in full. Usually none.'
        ),
    }),
    execute: async ({ recipe: ref, ingredient, lines, note, steps }) => {
      const em = fork()
      const recipe = await lookupRecipe(em, ref)
      const all = recipe.ingredients.getItems()
      const wanted = ingredient.trim().toLowerCase()
      const food = parseIngredient(ingredient).food
      const line =
        all.find((item) => item.rawText.trim().toLowerCase() === wanted) ??
        all.find(
          (item) => food && item.food && foodKey(item.food) === foodKey(food)
        ) ??
        all.find((item) => item.rawText.toLowerCase().includes(wanted))
      if (!line) {
        throw new AppError(
          "not_found",
          "ingredient_not_found",
          `${recipe.name} has no line like "${ingredient}". Its lines: ${all.map((item) => item.rawText).join("; ")}`
        )
      }
      const standIn = cleanLines(lines, 5, 500)
      const tastes = await getTastes(em, householdId)
      const avoided = avoidedIn(standIn, tastes.avoid)
      const offDiet = missingDiets(dietsFor(standIn), tastes.diets).length > 0
      // Lines it can't read may have anything, so they fail the checks.
      if ((avoided.length > 0 || offDiet) && !canRead(standIn)) {
        throw new AppError(
          "invalid",
          "unreadable",
          "Merran can't read those lines to check them against the household's tastes. Write them in English."
        )
      }
      if (avoided.length > 0) {
        throw new AppError(
          "invalid",
          "avoided",
          `The household doesn't eat ${avoided.map((item) => item.food).join(", ")}. Offer something else.`
        )
      }
      if (offDiet) {
        throw new AppError(
          "invalid",
          "against_diet",
          `That isn't ${tastes.diets.join(", ")}, which every meal must be. Offer something else.`
        )
      }
      const recipeSteps = recipe.steps.getItems()
      const changed = steps.flatMap((change) => {
        const step = recipeSteps[Math.round(change.step) - 1]
        const text = change.text.replace(/\s+/g, " ").trim().slice(0, 5000)
        return step && text && text !== step.text
          ? [{ stepId: step.id, text }]
          : []
      })
      return propose({
        kind: "swap",
        summary: `${standIn.join(", ")} instead of ${line.rawText}`,
        recipeId: recipe.id,
        payload: {
          ingredientId: line.id,
          insteadOf: line.rawText,
          lines: standIn,
          note: note.replace(/\s+/g, " ").trim().slice(0, 300),
          steps: changed,
        },
      })
    },
  })
}
