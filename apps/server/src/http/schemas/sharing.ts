import { z } from "@hono/zod-openapi"
import { DietSchema, NutritionSchema } from "./recipes.ts"

const EXAMPLE_SHARE = {
  url: "https://merran.example.com/r/q1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6j7k8l9z0x1c",
  createdAt: "2026-11-08T17:30:00.000Z",
}

export const RecipeShareSchema = z
  .object({
    url: z.string().nullable().openapi({
      description:
        "The link anyone can open to see and cook the recipe. Null while MERRAN_PUBLIC_URL isn't set, because links are built from it.",
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
    url: z.string().nullable().openapi({
      description:
        "The link anyone can open to see and cook the recipe. Null while MERRAN_PUBLIC_URL isn't set, because links are built from it.",
    }),
    sharedBy: z.object({ name: z.string() }).nullable().openapi({
      description:
        "Who shared it, or null once their account is deleted. A member removed from the household keeps their name.",
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

const EXAMPLE_SHARED_RECIPE = {
  name: "Lemon Chicken",
  description: "Crisp-skinned chicken in a bright pan sauce.",
  servings: 4,
  yieldText: null,
  prepMinutes: 15,
  cookMinutes: 35,
  totalMinutes: 50,
  diets: ["gluten-free" as const],
  nutrition: null,
  sourceUrl: null,
  photo: {
    full: "/api/shared/q1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6j7k8l9z0x1c/photo?size=full&v=0199e8b0",
    card: "/api/shared/q1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6j7k8l9z0x1c/photo?size=card&v=0199e8b0",
  },
  ingredients: [
    {
      id: "i1",
      section: null,
      text: "2 lemons, juiced",
      quantity: 2,
      quantityMax: null,
      unit: null,
      food: "lemon",
      note: "juiced",
    },
  ],
  steps: [
    { id: "s1", section: null, text: "Sear the chicken, skin side down." },
  ],
  household: { name: "The Riveras" },
}

export const SharedRecipeSchema = z
  .object({
    name: z.string(),
    description: z.string().nullable(),
    servings: z.number().nullable(),
    yieldText: z.string().nullable(),
    prepMinutes: z.number().nullable(),
    cookMinutes: z.number().nullable(),
    totalMinutes: z.number().nullable().openapi({
      description: "As given, or prep and cook added up.",
    }),
    diets: z.array(DietSchema),
    nutrition: NutritionSchema.nullable(),
    sourceUrl: z.string().nullable(),
    photo: z
      .object({
        full: z.string().openapi({ description: "For the recipe page." }),
        card: z.string().openapi({ description: "Cropped, for previews." }),
      })
      .nullable()
      .openapi({
        description:
          "Where its photo is, in each size, or null. The links need no sign-in.",
      }),
    ingredients: z.array(
      z.object({
        id: z.string().openapi({ description: "Its place in the list." }),
        section: z.string().nullable(),
        text: z.string().openapi({ description: "The line as written." }),
        quantity: z.number().nullable(),
        quantityMax: z.number().nullable(),
        unit: z.string().nullable(),
        food: z.string().nullable(),
        note: z.string().nullable(),
      })
    ),
    steps: z.array(
      z.object({
        id: z.string().openapi({ description: "Its place in the list." }),
        section: z.string().nullable(),
        text: z.string(),
      })
    ),
    household: z.object({ name: z.string() }).openapi({
      description: "The household that shared it.",
    }),
  })
  .openapi("SharedRecipe", {
    description:
      "A shared recipe as anyone with its link sees it: no notes, ratings, tags, history or ids.",
    example: EXAMPLE_SHARED_RECIPE,
  })
