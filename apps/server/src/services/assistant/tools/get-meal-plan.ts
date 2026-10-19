import { addDays } from "@merran/shared"
import { tool } from "ai"
import { z } from "zod"
import { householdToday } from "../../households/clock.ts"
import { listPlan } from "../../plan/plan.ts"
import { Day } from "./schemas.ts"
import type { ToolContext } from "./context.ts"

export function getMealPlanTool({
  fork,
  householdId,
}: Pick<ToolContext, "fork" | "householdId">) {
  return tool({
    description:
      "The meal plan between two days: what's planned, cooked or skipped. Two weeks from today when the days are null.",
    inputSchema: z.object({ from: Day.nullable(), to: Day.nullable() }),
    execute: async ({ from, to }) => {
      const em = fork()
      const today = await householdToday(em, householdId)
      const start = from ?? today
      const entries = await listPlan(em, {
        from: start,
        to: to ?? addDays(start, 13),
      })
      return {
        meals: entries.map((entry) => ({
          date: entry.date,
          anyDayThatWeek: entry.anyDay,
          meal: entry.meal,
          status: entry.status,
          recipe: entry.recipe
            ? { id: entry.recipe.id, name: entry.recipe.name }
            : null,
          with: entry.withRecipe?.name ?? null,
          note: entry.note,
          servings: entry.servings,
        })),
      }
    },
  })
}
