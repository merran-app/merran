import { tool } from "ai"
import { z } from "zod"
import { AppError } from "../../../core/errors.ts"
import { cleanLines } from "../../proposals/text.ts"
import type { ToolContext } from "./context.ts"

export function proposeListItemsTool({
  fork,
  propose,
}: Pick<ToolContext, "fork" | "propose">) {
  return tool({
    description:
      'Suggest things for the shopping list, one a line with how much: "2 lb ground beef", "paper towels". It\'s a card they add to the list.',
    inputSchema: z.object({
      summary: z.string(),
      items: z.array(z.string()).min(1).max(40),
    }),
    execute: async ({ summary, items }) => {
      const em = fork()
      const lines = cleanLines(items, 40, 200)
      if (lines.length === 0) {
        throw new AppError("invalid", "no_items", "Give something to add.")
      }
      return propose({ kind: "list", summary, payload: { items: lines } })
    },
  })
}
