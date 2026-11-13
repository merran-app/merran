import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { getHeadsUpSchedule } from "../../../../../../services/webhooks/heads-ups/settings.ts"
import { requireWebhooks } from "../../../../../../services/webhooks/webhooks.ts"
import { asHouseholdAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"
import { HeadsUpScheduleSchema } from "../../../../../schemas/webhooks.ts"

const route = createRoute({
  method: "get",
  path: "/households/current/webhooks/schedule",
  operationId: "getWebhookSchedule",
  tags: ["Webhooks"],
  summary: "When the daily heads-ups go",
  description:
    "Household admins only. The time each day, on the household's clock, that webhooks wanting `day.summary` or `pantry.use_soon` are sent them.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(HeadsUpScheduleSchema, "The household's time."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    requireWebhooks()
    const { em, householdId } = asHouseholdAdmin(c)
    return c.json(await getHeadsUpSchedule(em, householdId), 200)
  })
}
