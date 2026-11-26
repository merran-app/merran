import { tool } from "ai"
import { z } from "zod"
import { listRecipes, totalMinutes } from "../../recipes/recipes.ts"
import type { ToolContext } from "./context.ts"

export function searchRecipesTool({ fork }: Pick<ToolContext, "fork">) {
  return tool({
    description:
      "Search the household's recipe library, a page at a time: nextOffset says where the next page starts, or null when there's none. Each result says when it was last made. Use get_recipe for its lines, and whether it suits the household.",
    inputSchema: z.object({
      query: z
        .string()
        .nullable()
        .describe(
          "Words in its name, description or ingredients; null for any."
        ),
      tag: z.string().nullable(),
      maxMinutes: z.number().nullable().describe("Ready in this long or less."),
      notMadeYet: z.boolean().nullable(),
      limit: z.number().nullable().describe("Up to 20; 10 when null."),
      offset: z
        .number()
        .nullable()
        .describe(
          "Skip this many, for the next page: the last answer's nextOffset. 0 when null."
        ),
    }),
    execute: async ({ query, tag, maxMinutes, notMadeYet, limit, offset }) => {
      const em = fork()
      const start = Math.max(0, Math.round(offset ?? 0))
      const { recipes, total } = await listRecipes(em, {
        q: query ?? undefined,
        tag: tag ? [tag] : [],
        diet: [],
        new: notMadeYet ?? undefined,
        maxMinutes: maxMinutes ?? undefined,
        sort: "rating",
        limit: Math.min(Math.max(Math.round(limit ?? 10), 1), 20),
        offset: start,
      })
      const next = start + recipes.length
      return {
        total,
        // Null when this page reached the end, or went past it.
        nextOffset: recipes.length > 0 && next < total ? next : null,
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
