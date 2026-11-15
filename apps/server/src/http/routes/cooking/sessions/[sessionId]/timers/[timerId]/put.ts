import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import { setTimer } from "../../../../../../../services/cooking/timers.ts"
import { TimerRefSchema } from "../../../../../../../services/webhooks/payloads.ts"
import { inHousehold, openToKeys } from "../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../router.ts"
import {
  CookingTimerParam,
  TimerSettingSchema,
} from "../../../../../../schemas/cooking.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../../schemas/responses.ts"

const route = createRoute({
  method: "put",
  path: "/cooking/sessions/{sessionId}/timers/{timerId}",
  operationId: "setCookingTimer",
  tags: ["Cooking"],
  summary: "Start a timer, or give it more time",
  description:
    "Cook view calls this when a timer starts, sending `timer.started`, and when it gets +1 minute, sending `timer.extended`, even after it's gone off: it runs again. `seconds` is how many are left; the server works out when it ends and sends `timer.finished` then itself. A new timer needs the session to be open, but one it has can get more time after it ends, as timers keep ringing in the app after cook view is left.",
  ...openToKeys("plan", "write"),
  request: {
    params: CookingTimerParam,
    body: {
      required: true,
      content: { "application/json": { schema: TimerSettingSchema } },
    },
  },
  responses: {
    200: jsonResponse(TimerRefSchema, "The timer, with when it ends."),
    404: errorResponse(
      "No such cooking session of yours, or, for a new timer, it's ended."
    ),
    409: errorResponse("The session has 20 timers running already."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const { sessionId, timerId } = c.req.valid("param")
    const timer = await setTimer(
      em,
      householdId,
      userId,
      sessionId,
      timerId,
      c.req.valid("json")
    )
    return c.json(timer, 200)
  })
}
