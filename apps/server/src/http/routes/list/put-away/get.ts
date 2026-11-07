import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { toLookOver } from "../../../../services/pantry/put-away/review.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  PutAwayReviewQuery,
  PutAwayReviewSchema,
} from "../../../schemas/pantry.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/list/put-away",
  operationId: "getPutAwayReview",
  tags: ["List"],
  summary: "What the shopping put away",
  description:
    "What checked-off rows put in the pantry that hasn't been looked over: the rows, and the pantry items they went into, each once. Rows whose pantry item has gone since are left out.",
  ...openToKeys("list", "read"),
  request: { query: PutAwayReviewQuery },
  responses: {
    200: jsonResponse(PutAwayReviewSchema, "What went in."),
    404: errorResponse("No such list."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { list } = c.req.valid("query")
    return c.json(await toLookOver(em, householdId, { list }), 200)
  })
}
