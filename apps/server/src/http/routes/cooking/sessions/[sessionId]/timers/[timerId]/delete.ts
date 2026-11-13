import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import { cancelTimer } from "../../../../../../../services/cooking/timers.ts"
import { inHousehold, openToKeys } from "../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../router.ts"
import { CookingTimerParam } from "../../../../../../schemas/cooking.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/cooking/sessions/{sessionId}/timers/{timerId}",
  operationId: "cancelCookingTimer",
  tags: ["Cooking"],
  summary: "Cancel a timer",
  description:
    "Cook view calls this when a timer is cancelled before it goes off, sending `timer.cancelled`. Cancelling one that's gone off changes nothing and sends nothing. A session that was left with timers running ends when its last one is cancelled.",
  ...openToKeys("plan", "write"),
  request: { params: CookingTimerParam },
  responses: {
    204: { description: "Cancelled, or it had gone off already." },
    404: errorResponse("No such cooking session of yours, or no such timer."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const { sessionId, timerId } = c.req.valid("param")
    await cancelTimer(em, householdId, userId, sessionId, timerId)
    return c.body(null, 204)
  })
}
