import { tool } from "ai"
import { z } from "zod"
import { listRecipes, totalMinutes } from "../../recipes/recipes.ts"
import type { ToolContext } from "./context.ts"

export function searchRecipesTool({ fork }: Pick<ToolContext, "fork">) {
  return tool({
    description:
      "Search the household's recipe library. Each result says when it was last made. Use get_recipe for its lines, and whether it suits the household.",
    inputSchema: z.object({
      query: z
        .string()
        .nullable()
        .describe("Words in its name, description or tags; null for any."),
      tag: z.string().nullable(),
      maxMinutes: z.number().nullable().describe("Ready in this long or less."),
      notMadeYet: z.boolean().nullable(),
      limit: z.number().nullable().describe("Up to 20; 10 when null."),
    }),
    execute: async ({ query, tag, maxMinutes, notMadeYet, limit }) => {
      const em = fork()
      const { recipes, total } = await listRecipes(em, {
        q: query ?? undefined,
        tag: tag ? [tag] : [],
        diet: [],
        new: notMadeYet ?? undefined,
        maxMinutes: maxMinutes ?? undefined,
        sort: "rating",
        limit: Math.min(Math.max(Math.round(limit ?? 10), 1), 20),
        offset: 0,
      })
      return {
        total,
        recipes: recipes.map((recipe) => ({
          id: recipe.id,
          name: recipe.name,
          minutes: recipe.totalMinutes,
          servings: recipe.servings,
          rating: recipe.rating,
          tags: recipe.tags,
          lastMade: recipe.lastMadeAt?.slice(0, 10) ?? null,
        })),
      }
    },
  })
}
