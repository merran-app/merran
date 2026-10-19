import { tool } from "ai"
import { z } from "zod"
import { getList } from "../../list/list.ts"
import type { ToolContext } from "./context.ts"

export function getShoppingListTool({
  fork,
  householdId,
}: Pick<ToolContext, "fork" | "householdId">) {
  return tool({
    description: "The shopping list: what's to buy, and what's ticked off.",
    inputSchema: z.object({}),
    execute: async () => {
      const em = fork()
      const { items } = await getList(em, householdId)
      return {
        items: items.map((item) => ({
          name: item.name,
          amount: item.amount || null,
          ticked: item.checked,
        })),
      }
    },
  })
}
