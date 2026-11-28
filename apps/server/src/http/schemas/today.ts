import { z } from "@hono/zod-openapi"
import { IDS, RECIPE_SUMMARY } from "./examples.ts"
import { ITEM, PantryItemSchema } from "./pantry.ts"
import { RecipeSummarySchema } from "./recipes.ts"

// What Today shows at a glance.

export const TodaySchema = z
  .object({
    list: z
      .object({
        toBuy: z.number().openapi({
          description: "How many things on the list aren't checked off.",
        }),
        names: z.array(z.string()).openapi({
          description: "The first three of them, in the list's order.",
        }),
        meals: z.array(z.string()).openapi({
          description:
            "The planned meals they're for, by plan entry id, each once.",
        }),
      })
      .nullable()
      .openapi({
        description:
          "What's left to buy, or null for a key that can't read the list.",
      }),
    pantry: z
      .object({
        useSoon: z.array(PantryItemSchema).openapi({
          description: "What to use soon, most urgent first.",
        }),
        meals: z
          .array(
            z.object({
              id: z.string().openapi({ description: "The plan entry's id." }),
              names: z.array(z.string()).openapi({
                description:
                  "Up to four things set aside for it, in the pantry's order.",
              }),
            })
          )
          .openapi({
            description:
              "The planned meals something at home is set aside for.",
          }),
      })
      .nullable()
      .openapi({
        description:
          "What's at home, or null for a key that can't read the pantry.",
      }),
    recipes: z
      .object({
        total: z.number().openapi({ description: "How many recipes, in all." }),
        recent: z.array(RecipeSummarySchema).openapi({
          description: "The six newest.",
        }),
        cookAgain: z.array(RecipeSummarySchema).openapi({
          description:
            "Up to six favorites to cook again: rated four stars or more and not made in three weeks, from the 48 top rated.",
        }),
      })
      .nullable()
      .openapi({
        description: "The recipes, or null for a key that can't read recipes.",
      }),
  })
  .openapi("Today", {
    description:
      "What Today shows at a glance. A part is null when an API key can't read its area.",
    example: {
      list: {
        toBuy: 7,
        names: ["milk", "eggs", "lemons"],
        meals: [IDS.planEntry],
      },
      pantry: {
        useSoon: [ITEM],
        meals: [{ id: IDS.planEntry, names: ["chicken thighs"] }],
      },
      recipes: {
        total: 1,
        recent: [RECIPE_SUMMARY],
        cookAgain: [RECIPE_SUMMARY],
      },
    },
  })
