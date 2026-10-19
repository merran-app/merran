import { delegatedCredential } from "../../../services/auth/credentials.ts"
import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { listProposals } from "../../../services/proposals/proposals.ts"
import { readableProposalKinds } from "../../../services/proposals/permissions.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../schemas/responses.ts"
import {
  ProposalListQuerySchema,
  ProposalListSchema,
} from "../../schemas/tidy.ts"

const route = createRoute({
  method: "get",
  path: "/proposals",
  operationId: "listProposals",
  tags: ["Review"],
  summary: "The Review queue",
  description:
    "Suggestions waiting to be applied or dismissed, newest first. API keys also need read permission for each proposal kind: plan for meals/tastes, list for shopping items, imports for imports, and recipes otherwise.",
  ...openToKeys("recipes", "read"),
  request: { query: ProposalListQuerySchema },
  responses: {
    200: jsonResponse(ProposalListSchema, "What's waiting."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const delegated = delegatedCredential(c.var.credential)
    return c.json(
      await listProposals(em, {
        ...c.req.valid("query"),
        kinds: delegated
          ? readableProposalKinds(delegated.permissions)
          : undefined,
      }),
      200
    )
  })
}
