import { delegatedCredential } from "../../../../services/auth/credentials.ts"
import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { getProposal } from "../../../../services/proposals/proposals.ts"
import { requireProposalPermission } from "../../../../services/proposals/permissions.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"
import { ProposalParam, ProposalSchema } from "../../../schemas/tidy.ts"

const route = createRoute({
  method: "get",
  path: "/proposals/{proposalId}",
  operationId: "getProposal",
  tags: ["Review"],
  summary: "A suggestion",
  description:
    "Waiting, applied or dismissed. API keys additionally need read access to the affected area: plan for meals/tastes, list for shopping items, imports for imports, and recipes otherwise.",
  ...openToKeys("recipes", "read"),
  request: { params: ProposalParam },
  responses: {
    200: jsonResponse(ProposalSchema, "The suggestion."),
    404: errorResponse("No such suggestion."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const proposal = await getProposal(em, c.req.valid("param").proposalId)
    requireProposalPermission(
      delegatedCredential(c.var.credential)?.permissions,
      proposal.kind,
      "read"
    )
    return c.json(proposal, 200)
  })
}
