import { z } from "@hono/zod-openapi"
import { COOKING_OUTCOMES } from "@merran/shared"
import {
  MealRefSchema,
  RecipeRefSchema,
  TimerRefSchema,
} from "../../services/webhooks/payloads.ts"
import { IDS, TIMES } from "./examples.ts"

// Cooking sessions and their timers: what cook view reports, and what a
// Home Assistant sensor reads. Recipes, meals and timers are shaped as the
// cooking events carry them, so one template reads both.

export const CookingSessionParam = z.object({
  sessionId: z.uuid().openapi({ param: { name: "sessionId", in: "path" } }),
})

export const CookingTimerParam = CookingSessionParam.extend({
  timerId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/, "Use up to 64 letters, digits, - or _.")
    .openapi({
      param: { name: "timerId", in: "path" },
      description: "The timer's id, which cook view picks when it starts one.",
    }),
})

const servings = z
  .number()
  .positive("Use a number above 0.")
  .max(1000, "Use 1,000 or fewer.")
  .nullable()
  .openapi({
    description:
      "How many servings it's making, as cook view shows them. Null for a recipe that doesn't say.",
  })

export const NewCookingSessionSchema = z
  .object({
    recipe: z.string().min(1).openapi({
      description: "The recipe being cooked, by its id or slug.",
    }),
    with: z.string().min(1).nullable().optional().openapi({
      description: "The recipe cooked with it as a pairing, by id or slug.",
    }),
    meal: z.uuid().nullable().optional().openapi({
      description: "The planned meal it's cooked for: its entry in the plan.",
    }),
    servings: servings.optional(),
  })
  .openapi("NewCookingSession", {
    example: { recipe: "lemon-chicken", meal: IDS.planEntry, servings: 4 },
  })

export const CookingSessionChangesSchema = z
  .object({ servings: servings.optional() })
  .openapi("CookingSessionChanges", { example: { servings: 6 } })

export const LeaveCookingSchema = z
  .object({
    soon: z.boolean().optional().openapi({
      description:
        "Cook view's page went away, which may be a reload: end it a minute from now, unless cook view checks in first.",
    }),
  })
  .openapi("LeaveCooking", { example: {} })

export const TimerSettingSchema = z
  .object({
    label: z.string().trim().min(1).max(200).openapi({
      description: 'What it\'s for, like "Simmer the sauce".',
    }),
    seconds: z.number().int().min(1).max(86_400, "Use a day or less.").openapi({
      description:
        "How many seconds are left. The server works out when it ends, so a device whose clock is off doesn't move it.",
    }),
  })
  .openapi("TimerSetting", {
    example: { label: "Simmer the sauce", seconds: 600 },
  })

/** Sam cooking Lemon Chicken, with the sauce simmering. */
const SESSION_EXAMPLE = {
  id: IDS.cookingSession,
  cook: { id: IDS.sam, name: "Sam Rivera" },
  recipe: {
    id: IDS.lemonChicken,
    slug: "lemon-chicken",
    title: "Lemon Chicken",
    url: "https://merran.example.com/recipes/lemon-chicken",
  },
  with: null,
  meal: null,
  servings: 4,
  startedAt: TIMES.now,
  heardAt: TIMES.now,
  leaving: false,
  endedAt: null,
  outcome: null,
  timers: [
    {
      id: "t-4f2a",
      label: "Simmer the sauce",
      seconds: 600,
      endsAt: "2026-10-15T18:40:00.000Z",
    },
  ],
}

export const CookingSessionSchema = z
  .object({
    id: z.string(),
    cook: z
      .object({ id: z.string(), name: z.string() })
      .nullable()
      .openapi({ description: "Who's cooking. Null if they've left Merran." }),
    recipe: RecipeRefSchema,
    with: RecipeRefSchema.nullable().openapi({
      description: "The recipe cooked with it as a pairing, if any.",
    }),
    meal: MealRefSchema.nullable().openapi({
      description: "The planned meal it's cooked for, if any.",
    }),
    servings: z.number().nullable(),
    startedAt: z.string(),
    heardAt: z.string().openapi({
      description: "When cook view last said it's still cooking.",
    }),
    leaving: z.boolean().openapi({
      description:
        "Cook view was left with a timer still running, or its page went away a moment ago: it ends when the timers are done, or in a minute.",
    }),
    endedAt: z.string().nullable(),
    outcome: z.enum(COOKING_OUTCOMES).nullable(),
    timers: z.array(TimerRefSchema).openapi({
      description: "Its running timers, the soonest first.",
    }),
  })
  .openapi("CookingSession", { example: SESSION_EXAMPLE })

export const CookingSessionsSchema = z
  .object({ sessions: z.array(CookingSessionSchema) })
  .openapi("CookingSessions", { example: { sessions: [SESSION_EXAMPLE] } })

/** Made it's own field, on both of its routes: the session it ends. */
export const MadeInSessionField = z.uuid().optional().openapi({
  description:
    "The cooking session it was made in, from cook view. It ends, as `made`, sending `cooking.ended` after `meal.cooked`. A session that's ended, or someone else's, is left alone.",
})
