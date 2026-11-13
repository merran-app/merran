import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { madeInSession } from "../../../../../services/cooking/sessions.ts"
import { updateEntry } from "../../../../../services/plan/plan.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  PlanEntryChangesSchema,
  PlanEntryParam,
  PlanEntrySchema,
} from "../../../../schemas/plan.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "patch",
  path: "/plan/entries/{entryId}",
  operationId: "changePlanEntry",
  tags: ["Plan"],
  summary: "Change a meal",
  description:
    "Move it (it goes after any dishes in its new slot), swap its recipe, give it a side, change its servings, or mark it planned, cooked or skipped. Cooked sets when its recipe and side were last made.",
  ...openToKeys("plan", "write"),
  request: {
    params: PlanEntryParam,
    body: {
      required: true,
      content: { "application/json": { schema: PlanEntryChangesSchema } },
    },
  },
  responses: {
    200: jsonResponse(PlanEntrySchema, "Changed."),
    404: errorResponse("No such meal on the plan, or no such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const { session, ...changes } = c.req.valid("json")
    const entry = await updateEntry(
      em,
      householdId,
      c.req.valid("param").entryId,
      changes
    )
    // Made it from cook view ends its cooking session, after meal.cooked.
    if (session && changes.status === "cooked" && entry.status === "cooked") {
      await madeInSession(em, householdId, userId, session, deps.logger)
    }
    return c.json(entry, 200)
  })
}
