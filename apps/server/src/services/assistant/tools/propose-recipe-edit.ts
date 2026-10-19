import { type TidyValues } from "@merran/shared"
import { tool } from "ai"
import { z } from "zod"
import { AppError } from "../../../core/errors.ts"
import { totalMinutes } from "../../recipes/recipes.ts"
import { cleanLines } from "../../proposals/text.ts"
import { detailsOf, reviewSnapshot } from "../../recipes/review/snapshot.ts"
import { sameList } from "../../proposals/comparison.ts"
import { tagKey } from "../../recipes/tags.ts"
import { lookupRecipe } from "./recipes.ts"
import { RecipeFields } from "./schemas.ts"
import type { ToolContext } from "./context.ts"

export function proposeRecipeEditTool({
  fork,
  propose,
}: Pick<ToolContext, "fork" | "propose">) {
  return tool({
    description:
      "Suggest changes to a recipe in the library: a swap, a scaled batch, an extra step, notes. Give the whole new list for a list you change, keeping its other lines word for word, and null for anything that stays as it is. It's a card they apply.",
    inputSchema: z.object({
      recipe: z.string().describe("Its id or name."),
      summary: z
        .string()
        .describe("What changes, in one short sentence, for the card."),
      ...RecipeFields,
    }),
    execute: async ({ recipe: ref, summary, ...proposed }) => {
      const em = fork()
      const recipe = await lookupRecipe(em, ref)
      const { input } = await reviewSnapshot(em, recipe)
      const before: TidyValues = {}
      const after: TidyValues = {}
      for (const section of ["ingredients", "steps"] as const) {
        const value = proposed[section]
        if (!value) continue
        const lines =
          section === "ingredients"
            ? cleanLines(value, 300, 500)
            : cleanLines(value, 200, 5000)
        if (lines.length > 0 && !sameList(lines, input[section])) {
          before[section] = input[section]
          after[section] = lines
        }
      }
      if (proposed.tags) {
        const tags = [
          ...new Set(proposed.tags.map((tag) => tag.trim()).filter(Boolean)),
        ].slice(0, 30)
        const keys = (list: readonly string[]) => list.map(tagKey).sort()
        if (!sameList(keys(tags), keys(input.tags))) {
          before.tags = input.tags
          after.tags = tags
        }
      }
      const description = proposed.description?.trim().slice(0, 2000)
      if (description && description !== input.description) {
        before.description = input.description
        after.description = description
      }
      const current = detailsOf(input)
      const details = { ...current }
      for (const key of [
        "servings",
        "prepMinutes",
        "cookMinutes",
        "totalMinutes",
      ] as const) {
        const value = proposed[key]
        if (value !== null && value > 0 && value < 100_000) {
          details[key] = key === "servings" ? value : Math.round(value)
        }
      }
      if (!sameList([details], [current])) {
        before.details = current
        after.details = details
      }
      const notes = proposed.notes?.trim().slice(0, 5000)
      if (notes && notes !== input.notes) {
        before.notes = input.notes
        after.notes = notes
      }
      if (Object.keys(after).length === 0) {
        throw new AppError(
          "invalid",
          "nothing_changes",
          "That doesn't change the recipe: give the new lines or values."
        )
      }
      return propose({
        kind: "edit",
        summary,
        recipeId: recipe.id,
        before,
        after,
      })
    },
  })
}
