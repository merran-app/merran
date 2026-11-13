import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { checkIn } from "../../../../../services/cooking/sessions.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  CookingSessionChangesSchema,
  CookingSessionParam,
  CookingSessionSchema,
} from "../../../../schemas/cooking.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "patch",
  path: "/cooking/sessions/{sessionId}",
  operationId: "checkInCooking",
  tags: ["Cooking"],
  summary: "Still cooking",
  description:
    "Cook view checks in every 5 minutes while it's open and on screen, when it's on screen again, and when servings change. A session with no word for 30 minutes and no timer running ends. Checking in calls off an ending that was coming: a reload's page going away, or leaving with a timer running. Sends nothing.",
  ...openToKeys("plan", "write"),
  request: {
    params: CookingSessionParam,
    body: {
      required: true,
      content: {
        "application/json": { schema: CookingSessionChangesSchema },
      },
    },
  },
  responses: {
    200: jsonResponse(CookingSessionSchema, "Still cooking."),
    404: errorResponse(
      "No such cooking session of yours, or it's ended: start a new one."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const session = await checkIn(
      em,
      householdId,
      userId,
      c.req.valid("param").sessionId,
      c.req.valid("json")
    )
    return c.json(session, 200)
  })
}
