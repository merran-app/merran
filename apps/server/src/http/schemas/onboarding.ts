import { z } from "@hono/zod-openapi"

export const OnboardingSchema = z
  .object({
    tours: z.record(z.string(), z.number().int().nonnegative()),
    toursDisabled: z.boolean(),
    dismissed: z.boolean(),
    reviewed: z.boolean(),
    progress: z.object({
      recipe: z.boolean(),
      plan: z.boolean(),
      list: z.boolean(),
      cook: z.boolean(),
    }),
  })
  .openapi("Onboarding", {
    example: {
      tours: { today: 1 },
      toursDisabled: false,
      dismissed: false,
      reviewed: true,
      progress: { recipe: true, plan: false, list: false, cook: false },
    },
  })

export const OnboardingChangesSchema = z
  .object({
    dismissed: z.boolean().optional(),
    toursDisabled: z.boolean().optional(),
    resetTours: z.literal(true).optional(),
    tour: z
      .object({
        id: z.enum([
          "today",
          "recipes",
          "plan",
          "list",
          "pantry",
          "recipe",
          "settings",
          "assistant",
        ]),
        version: z.number().int().min(0).max(1000),
      })
      .optional(),
    reviewed: z.literal(true).optional(),
    recordProgress: z.literal(true).optional(),
  })
  .openapi("OnboardingChanges", {
    example: { tour: { id: "today", version: 1 }, dismissed: false },
  })
