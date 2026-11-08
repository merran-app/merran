import { z } from "@hono/zod-openapi"
import { IDS, TIMES } from "./examples.ts"
import { ListItemSchema } from "./list.ts"
import { PantrySnapshotSchema } from "./pantry.ts"

// Ran out of anything? after cooking: what's used up at home, and listed.

const USED_UP = {
  id: IDS.pantryItems[0],
  name: "chicken thighs",
  foodKey: "chicken thigh",
  quantity: 1,
  unit: "pound",
  amountText: null,
  aisle: IDS.aisles[1],
  storedIn: "fridge" as const,
  useBy: "2026-10-18",
  forMeals: null,
  createdAt: TIMES.now,
}

export const RanOutQuery = z.object({
  meal: z.uuid().openapi({
    param: { name: "meal", in: "query" },
    description: "The cooked meal.",
    example: IDS.planEntry,
  }),
})

export const RanOutFoodsSchema = z
  .object({
    foods: z
      .array(
        z.object({
          food: z.string().openapi({
            description: "The food, as the pantry and the list know it.",
          }),
          name: z.string(),
          staple: z.boolean().openapi({
            description: "One of the household's always-on-hand foods.",
          }),
        })
      )
      .openapi({
        description:
          "Each food once: the recipe's in order, then its side's. Water is left out.",
      }),
  })
  .openapi("RanOutFoods", {
    example: {
      foods: [
        { food: "chicken thigh", name: "chicken thighs", staple: false },
        { food: "salt", name: "salt", staple: true },
      ],
    },
  })

export const RanOutSchema = z
  .object({
    meal: z.uuid().openapi({ description: "The cooked meal." }),
    foods: z.array(z.string()).max(100).openapi({
      description:
        "Foods that ran out, from what could have. Others are passed over.",
    }),
    list: z.boolean().openapi({
      description:
        "Put them on the list too, as plain lines for no meal, unless they're on it already.",
    }),
  })
  .openapi("RanOut", {
    example: { meal: IDS.planEntry, foods: ["chicken thigh"], list: true },
  })

export const RanOutResultSchema = z
  .object({
    usedUp: z.array(PantrySnapshotSchema).openapi({
      description:
        "What was used up, as it was: for Undo with /pantry/restore.",
    }),
    listed: z.array(ListItemSchema).openapi({
      description:
        "What went on the list: for Undo, their ids go in /list/restore's `remove`.",
    }),
  })
  .openapi("RanOutResult", { example: { usedUp: [USED_UP], listed: [] } })
