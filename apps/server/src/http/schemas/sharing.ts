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

const EXAMPLE_HOUSEHOLD_SHARE = {
  recipe: { slug: "lemon-pasta", name: "Lemon Pasta" },
  url: EXAMPLE_SHARE.url,
  sharedBy: { name: "Sam Rivera" },
  createdAt: EXAMPLE_SHARE.createdAt,
  openedAt: "2026-11-09T12:00:00.000Z",
}

export const HouseholdShareSchema = z
  .object({
    recipe: z.object({ slug: z.string(), name: z.string() }),
    url: z.string().openapi({
      description: "The link anyone can open to see and cook the recipe.",
    }),
    sharedBy: z.object({ name: z.string() }).nullable().openapi({
      description: "Who shared it, or null once they've left the household.",
    }),
    createdAt: z.string(),
    openedAt: z.string().nullable().openapi({
      description: "When someone last opened the link, or null if none has.",
    }),
  })
  .openapi("HouseholdShare", { example: EXAMPLE_HOUSEHOLD_SHARE })

export const HouseholdSharesSchema = z
  .object({ shares: z.array(HouseholdShareSchema) })
  .openapi("HouseholdShares", {
    example: { shares: [EXAMPLE_HOUSEHOLD_SHARE] },
  })

export const RecipeShareStatusSchema = z
  .object({
    share: z.union([RecipeShareSchema, z.null()]).openapi({
      description: "Its link, or null while it isn't shared.",
    }),
  })
  .openapi("RecipeShareStatus", { example: { share: EXAMPLE_SHARE } })
