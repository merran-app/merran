import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { startSession } from "../../../../services/cooking/sessions.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  CookingSessionSchema,
  NewCookingSessionSchema,
} from "../../../schemas/cooking.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/cooking/sessions",
  operationId: "startCooking",
  tags: ["Cooking"],
  summary: "Start cooking",
  description:
    "Cook view calls this when someone leaves Get ready, or opens it on a recipe with nothing to get ready. Sends `cooking.started`. Each device cooking is a session of its own, and only its cook can change or end it.",
  ...openToKeys("plan", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: NewCookingSessionSchema } },
    },
  },
  responses: {
    201: jsonResponse(CookingSessionSchema, "Cooking started."),
    404: errorResponse("No such recipe, or no such meal on the plan."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const session = await startSession(
      em,
      householdId,
      userId,
      c.req.valid("json")
    )
    return c.json(session, 201)
  })
}
