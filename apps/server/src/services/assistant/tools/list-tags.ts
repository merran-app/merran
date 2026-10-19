import { tool } from "ai"
import { z } from "zod"
import { listTags } from "../../recipes/tags.ts"
import type { ToolContext } from "./context.ts"

export function listTagsTool({ fork }: Pick<ToolContext, "fork">) {
  return tool({
    description: "The household's tags, with how many recipes have each.",
    inputSchema: z.object({}),
    execute: async () => ({
      tags: (await listTags(fork())).map((tag) => ({
        name: tag.name,
        recipes: tag.recipes,
      })),
    }),
  })
}
