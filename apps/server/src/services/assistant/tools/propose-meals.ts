import { avoidedIn, canRead, MEALS, type HouseholdTastes } from "@merran/shared"
import { tool } from "ai"
import { z } from "zod"
import { AppError } from "../../../core/errors.ts"
import type { Recipe } from "../../../database/entities/index.ts"
import { getTastes } from "../../households/tastes.ts"
import { decodeDiets } from "../../recipes/diet-labels.ts"
import { lookupRecipe } from "./recipes.ts"
import { Day } from "./schemas.ts"
import type { ToolContext } from "./context.ts"

/**
 * Why a recipe can't go on the plan, for the model: it has one of the
 * household's allergies, or may, as Merran can't read its ingredients.
 * Allergies are never left to chance. Foods someone just doesn't eat are
 * theirs to ask for anyway, so the model, which knows them, keeps to them.
 */
function allergyIn(recipe: Recipe, tastes: HouseholdTastes) {
  const lines = recipe.ingredients.getItems().map((line) => line.rawText)
  const found = avoidedIn(
    lines,
    tastes.avoid.filter((item) => item.level === "allergy"),
    decodeDiets(recipe.diets)
  )
  if (found.length === 0) return null
  const foods = found.map((item) => item.food).join(", ")
  return canRead(lines)
    ? `${recipe.name} has ${foods}, an allergy in the household. Offer something else.`
    : `Merran can't read the ingredients of ${recipe.name}, so it can't check them for the household's allergies (${foods}). Offer something else.`
}

export function proposeMealsTool({
  fork,
  householdId,
  propose,
}: Pick<ToolContext, "fork" | "householdId" | "propose">) {
  return tool({
    description:
      'Suggest meals for the plan: recipes from the library (by id or name), with a recipe that goes with it if wanted, or a note like "Leftovers". It\'s a card they add to the plan.',
    inputSchema: z.object({
      summary: z.string().describe("What it plans, in a short sentence."),
      meals: z
        .array(
          z.object({
            date: Day,
            meal: z.enum(MEALS),
            recipe: z.string().nullable(),
            with: z
              .string()
              .nullable()
              .describe("A recipe it goes with, like a sauce."),
            note: z.string().nullable(),
            servings: z.number().nullable(),
          })
        )
        .min(1)
        .max(21),
    }),
    execute: async ({ summary, meals }) => {
      const em = fork()
      const tastes = await getTastes(em, householdId)
      const ref = async (name: string | null) => {
        if (!name) return null
        const recipe = await lookupRecipe(em, name)
        const allergy = allergyIn(recipe, tastes)
        if (allergy) throw new AppError("invalid", "allergy", allergy)
        return { id: recipe.id, slug: recipe.slug, name: recipe.name }
      }
      const planned = []
      for (const meal of meals) {
        const recipe = await ref(meal.recipe)
        const note = meal.note?.trim().slice(0, 200) || null
        if (!recipe && !note) {
          throw new AppError(
            "invalid",
            "empty_meal",
            `The ${meal.meal} on ${meal.date} needs a recipe or a note.`
          )
        }
        planned.push({
          date: meal.date,
          meal: meal.meal,
          recipe,
          with: await ref(meal.with),
          note,
          servings:
            meal.servings && meal.servings > 0 && meal.servings <= 1000
              ? meal.servings
              : null,
        })
      }
      return propose({ kind: "meals", summary, payload: { meals: planned } })
    },
  })
}
