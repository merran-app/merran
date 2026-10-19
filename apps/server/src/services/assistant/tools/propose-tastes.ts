import { AVOID_LEVELS, DIETS } from "@merran/shared"
import { tool } from "ai"
import { z } from "zod"
import { AppError } from "../../../core/errors.ts"
import type { ToolContext } from "./context.ts"

export function proposeTastesTool({
  fork,
  propose,
}: Pick<ToolContext, "fork" | "propose">) {
  return tool({
    description:
      "Offer to remember something about the household: a food someone doesn't eat (an allergy, never, or one to leave out of dishes that can do without it), and who it's for if not everyone; a diet every meal must fit; or the longest a weeknight dinner can take. It's a card they accept.",
    inputSchema: z.object({
      summary: z.string(),
      avoid: z.array(
        z.object({
          food: z.string(),
          level: z.enum(AVOID_LEVELS),
          who: z.string().nullable(),
        })
      ),
      diets: z.array(z.enum(DIETS)),
      weeknightMinutes: z.number().nullable(),
    }),
    execute: async ({ summary, avoid, diets, weeknightMinutes }) => {
      const em = fork()
      const foods = avoid
        .map((item) => ({
          food: item.food.trim().slice(0, 60),
          level: item.level,
          who: item.who?.trim().slice(0, 40) || null,
        }))
        .filter((item) => item.food)
      const minutes =
        weeknightMinutes && weeknightMinutes >= 10 && weeknightMinutes <= 240
          ? Math.round(weeknightMinutes)
          : null
      if (foods.length === 0 && diets.length === 0 && minutes === null) {
        throw new AppError(
          "invalid",
          "nothing_to_remember",
          "Give something to remember."
        )
      }
      return propose({
        kind: "tastes",
        summary,
        payload: { avoid: foods, diets, weeknightMinutes: minutes },
      })
    },
  })
}
