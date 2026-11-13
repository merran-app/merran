import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { saveHeadsUpSchedule } from "../../../../../../services/webhooks/heads-ups/settings.ts"
import { requireWebhooks } from "../../../../../../services/webhooks/webhooks.ts"
import { asHouseholdAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"
import { HeadsUpScheduleSchema } from "../../../../../schemas/webhooks.ts"

const route = createRoute({
  method: "put",
  path: "/households/current/webhooks/schedule",
  operationId: "setWebhookSchedule",
  tags: ["Webhooks"],
  summary: "Change when the daily heads-ups go",
  description:
    "Household admins only. A time that's already gone by today takes effect tomorrow; one still to come sends today's, unless it's been sent.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: HeadsUpScheduleSchema } },
    },
  },
  responses: {
    200: jsonResponse(HeadsUpScheduleSchema, "Saved."),
    400: errorResponse("The time isn't a 24-hour time, like 07:00."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    requireWebhooks()
    const { em, householdId } = asHouseholdAdmin(c)
    const saved = await saveHeadsUpSchedule(
      em,
      householdId,
      c.req.valid("json")
    )
    return c.json(saved, 200)
  })
}
