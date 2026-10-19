import type { EntityManager } from "@mikro-orm/sql"
import type { createProposal } from "../../proposals/proposals.ts"

/** The caller supplies household-scoped database access and proposal ownership. */
export type ToolContext = {
  fork: () => EntityManager
  householdId: string
  propose: (
    options: Omit<
      Parameters<typeof createProposal>[1],
      "householdId" | "userId" | "chat"
    >
  ) => Promise<{ proposal: Awaited<ReturnType<typeof createProposal>> }>
}
