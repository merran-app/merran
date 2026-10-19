import type { EntityManager } from "@mikro-orm/sql"
import type { ToolSet } from "ai"
import type { AiDeps } from "../../ai/run.ts"
import { createProposal } from "../../proposals/proposals.ts"
import type { FileStore } from "../../storage/files.ts"
import type { ToolContext } from "./context.ts"
import { scanReceiptTool } from "./scan-receipt.ts"
import { proposeSwapTool } from "./propose-swap.ts"
import { proposeTastesTool } from "./propose-tastes.ts"
import { proposeImportRecipeTool } from "./propose-import-recipe.ts"

import { sharedTools } from "./catalog.ts"

type ChatContext = {
  householdId: string
  userId: string
  chatId: string
  /** The photos and PDFs sent with the message being answered. */
  files: readonly { id: string }[]
}

/** Bind the tools to this chat; proposals remain cards for the person to apply. */
export function assistantTools(
  deps: AiDeps & { files: FileStore },
  root: EntityManager,
  chat: ChatContext
): ToolSet {
  // A step can call several tools at once: each gets its own view.
  const fork = () => root.fork()
  const context: ToolContext = {
    fork,
    householdId: chat.householdId,
    propose: (options) =>
      createProposal(fork(), {
        ...options,
        householdId: chat.householdId,
        userId: chat.userId,
        chat: chat.chatId,
      }).then((proposal) => ({ proposal })),
  }
  return {
    ...sharedTools(context),
    scan_receipt: scanReceiptTool(
      { ...context, userId: chat.userId, files: chat.files },
      deps
    ),
    propose_swap: proposeSwapTool(context),
    propose_tastes: proposeTastesTool(context),
    propose_import_recipe: proposeImportRecipeTool(context, deps),
  }
}
