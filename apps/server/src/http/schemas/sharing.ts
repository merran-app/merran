import { z } from "@hono/zod-openapi"

const EXAMPLE_SHARE = {
  url: "https://merran.example.com/r/q1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6j7k8l9z0x1c",
  createdAt: "2026-11-08T17:30:00.000Z",
}

export const RecipeShareSchema = z
  .object({
    url: z.string().openapi({
      description: "The link anyone can open to see and cook the recipe.",
    }),
    createdAt: z.string(),
  })
  .openapi("RecipeShare", { example: EXAMPLE_SHARE })

export const RecipeShareStatusSchema = z
  .object({
    share: z.union([RecipeShareSchema, z.null()]).openapi({
      description: "Its link, or null while it isn't shared.",
    }),
  })
  .openapi("RecipeShareStatus", { example: { share: EXAMPLE_SHARE } })
