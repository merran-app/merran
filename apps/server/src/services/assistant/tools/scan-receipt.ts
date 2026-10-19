import { tool } from "ai"
import { z } from "zod"
import { AppError } from "../../../core/errors.ts"
import type { AiDeps } from "../../ai/run.ts"
import { readReceipt } from "../../pantry/receipts/receipts.ts"
import type { FileStore } from "../../storage/files.ts"
import { readChatFile } from "../files.ts"
import type { ToolContext } from "./context.ts"

type ReceiptContext = Pick<ToolContext, "fork" | "householdId"> & {
  userId: string
  files: readonly { id: string }[]
}

export function scanReceiptTool(
  { fork, householdId, userId, files }: ReceiptContext,
  deps: AiDeps & { files: FileStore }
) {
  return tool({
    description:
      "Read a receipt sent with this message (a photo, screenshots or a PDF) into a draft for the pantry: they look it over, fix anything, and add it, which takes what they bought off the shopping list too. Don't list its lines in the chat.",
    inputSchema: z.object({}),
    execute: async () => {
      if (files.length === 0) {
        throw new AppError(
          "invalid",
          "no_receipt",
          "No photo or PDF came with this message. Ask them to add the receipt with +."
        )
      }
      const owner = {
        householdId,
        userId,
      }
      const input = await Promise.all(
        files.map(async (file) => {
          const kept = await readChatFile(deps.files, owner, file.id)
          if (!kept) {
            throw new AppError(
              "not_found",
              "file_not_found",
              "That file is gone. Ask them to add it again."
            )
          }
          return { body: kept.body, type: kept.mediaType }
        })
      )
      const { what, receipt } = await readReceipt(fork(), deps, {
        householdId,
        userId,
        input: { files: input, text: null },
      })
      if (!receipt) {
        throw new AppError(
          "unprocessable",
          "not_a_receipt",
          what === "recipe"
            ? "That's a recipe, not a receipt: offer it with propose_new_recipe."
            : "There's no receipt in that."
        )
      }
      return {
        receipt: {
          id: receipt.id,
          store: receipt.store,
          date: receipt.date,
          lines: receipt.lines.length,
          food: receipt.lines.filter((line) => line.kind === "food").length,
          onList: receipt.lines.filter((line) => line.listItem).length,
        },
      }
    },
  })
}
