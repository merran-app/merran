import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { bulkPlan, type BulkAction } from "../../../../../services/plan/plan.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  PlanBulkResultSchema,
  PlanBulkSchema,
} from "../../../../schemas/plan.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/plan/entries/bulk",
  operationId: "changePlanEntries",
  tags: ["Plan"],
  summary: "Change several meals at once",
  description:
    "Take them off, move them (to another day or meal, or the week's pool), or mark them planned, cooked or skipped: all or none. Swap two meals' places, or put one meal's dishes in order. The answer says what they were before, for Undo with /plan/restore. Ids not on the plan are passed over, except in a swap.",
  ...openToKeys("plan", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PlanBulkSchema } },
    },
  },
  responses: {
    200: jsonResponse(PlanBulkResultSchema, "Done."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { ids, action, date, meal, anyDay, status } = c.req.valid("json")
    const result = await bulkPlan(em, householdId, ids, bulkAction())
    return c.json(result, 200)

    function bulkAction(): BulkAction {
      switch (action) {
        case "move":
          return { action, date: date!, meal, anyDay }
        case "status":
          return { action, status: status! }
        default:
          return { action }
      }
    }
  })
}
