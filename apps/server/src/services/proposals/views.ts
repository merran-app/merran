import { PROPOSAL_SECTIONS } from "@merran/shared"
import type { Proposal } from "../../database/entities/index.ts"

/** A proposal as the API shows it. */
export function describeProposal(proposal: Proposal) {
  const recipe = proposal.recipe?.getEntity()
  return {
    id: proposal.id,
    kind: proposal.kind,
    status: proposal.status,
    recipe:
      recipe && proposal.recipe?.isInitialized()
        ? { id: recipe.id, slug: recipe.slug, name: recipe.name }
        : null,
    summary: proposal.summary,
    sections: PROPOSAL_SECTIONS.filter((section) => section in proposal.after),
    note: proposal.note ?? null,
    payload: proposal.payload ?? null,
    chat: proposal.chat ?? null,
    before: proposal.before,
    after: proposal.after,
    createdAt: proposal.createdAt.toISOString(),
    resolvedAt: proposal.resolvedAt?.toISOString() ?? null,
  }
}
export type ProposalView = ReturnType<typeof describeProposal>
