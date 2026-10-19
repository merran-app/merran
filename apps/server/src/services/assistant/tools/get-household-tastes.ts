import { tool } from "ai"
import { z } from "zod"
import { getTastes } from "../../households/tastes.ts"
import type { ToolContext } from "./context.ts"

export function getHouseholdTastesTool({
  fork,
  householdId,
}: Pick<ToolContext, "fork" | "householdId">) {
  return tool({
    description:
      "The household's diets, avoided foods and allergies. Check these before proposing meals.",
    inputSchema: z.object({}),
    execute: async () => getTastes(fork(), householdId),
  })
}
