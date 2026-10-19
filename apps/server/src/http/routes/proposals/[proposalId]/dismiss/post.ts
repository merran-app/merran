import { delegatedCredential } from "../../../../../services/auth/credentials.ts"
import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { dismissProposal } from "../../../../../services/proposals/proposals.ts"
import { getProposal } from "../../../../../services/proposals/proposals.ts"
import { requireProposalPermission } from "../../../../../services/proposals/permissions.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { ProposalParam, ProposalSchema } from "../../../../schemas/tidy.ts"

const route = createRoute({
  method: "post",
  path: "/proposals/{proposalId}/dismiss",
  operationId: "dismissProposal",
  tags: ["Review"],
  summary: "Dismiss a suggestion",
  description:
    "The suggestion is discarded without applying it. API keys additionally need write access to the affected area: plan for meals/tastes, list for shopping items, imports for imports, and recipes otherwise.",
  ...openToKeys("recipes", "write"),
  request: { params: ProposalParam },
  responses: {
    200: jsonResponse(ProposalSchema, "Dismissed."),
    404: errorResponse("No such suggestion."),
    409: errorResponse("Applied or dismissed already."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, userId } = inHousehold(c)
    const current = await getProposal(em, c.req.valid("param").proposalId)
    requireProposalPermission(
      delegatedCredential(c.var.credential)?.permissions,
      current.kind,
      "write"
    )
    const proposal = await dismissProposal(em, {
      userId,
      proposalId: c.req.valid("param").proposalId,
    })
    return c.json(proposal, 200)
  })
}
