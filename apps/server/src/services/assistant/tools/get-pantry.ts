import { tool } from "ai"
import { z } from "zod"
import { getPantry } from "../../pantry/pantry.ts"
import { householdToday } from "../../households/clock.ts"
import type { ToolContext } from "./context.ts"

export function getPantryTool({
  fork,
  householdId,
}: Pick<ToolContext, "fork" | "householdId">) {
  return tool({
    description:
      "What's at home, in the fridge, the freezer and the cupboard, and when it should be used by.",
    inputSchema: z.object({}),
    execute: async () => {
      const em = fork()
      const { items } = await getPantry(em, householdId)
      return {
        today: await householdToday(em, householdId),
        items: items.map((item) => ({
          name: item.name,
          amount: item.amount || null,
          storedIn: item.storedIn,
          useBy: item.useBy,
        })),
      }
    },
  })
}
