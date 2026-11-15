import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { leaveSession } from "../../../../../../services/cooking/sessions.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  CookingSessionParam,
  CookingSessionSchema,
  LeaveCookingSchema,
} from "../../../../../schemas/cooking.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/cooking/sessions/{sessionId}/end",
  operationId: "leaveCooking",
  tags: ["Cooking"],
  summary: "Leave cooking",
  description:
    "Cook view was left without Made it. Cooking ends now, sending `cooking.ended` (`stopped`), or, with a timer still running, when the last one is done or cancelled. With `soon`, for a page that went away, it ends a minute from now unless cook view checks in first, as a reload does. Made it ends a session through its own routes instead.",
  ...openToKeys("plan", "write"),
  request: {
    params: CookingSessionParam,
    body: {
      required: false,
      content: { "application/json": { schema: LeaveCookingSchema } },
    },
  },
  responses: {
    200: jsonResponse(
      CookingSessionSchema,
      "Left: ended, or ending when its timers are done or in a minute."
    ),
    404: errorResponse("No such cooking session of yours, or it's ended."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const { soon = false } = c.req.valid("json") ?? {}
    const session = await leaveSession(
      em,
      householdId,
      userId,
      c.req.valid("param").sessionId,
      { soon }
    )
    return c.json(session, 200)
  })
}
