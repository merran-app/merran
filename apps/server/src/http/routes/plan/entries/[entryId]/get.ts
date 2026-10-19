import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { findEntry, describeEntry } from "../../../../../services/plan/plan.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { PlanEntryParam, PlanEntrySchema } from "../../../../schemas/plan.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
const route = createRoute({
  method: "get",
  path: "/plan/entries/{entryId}",
  operationId: "getPlanEntry",
  tags: ["Plan"],
  summary: "One planned meal, including its saved cooking variants",
  ...openToKeys("plan", "read"),
  request: { params: PlanEntryParam },
  responses: {
    200: jsonResponse(PlanEntrySchema, "Planned meal."),
    404: errorResponse("No such meal."),
    ...SIGNED_IN_ERRORS,
  },
})
export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json(
      describeEntry(await findEntry(em, c.req.valid("param").entryId)),
      200
    )
  })
}
