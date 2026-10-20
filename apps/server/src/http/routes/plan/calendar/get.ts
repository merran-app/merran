import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import {
  CalendarSubscription,
  Household,
} from "../../../../database/entities/index.ts"
import { calendarSettings } from "../../../../services/plan/calendar/subscriptions.ts"
import { inHousehold } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { CalendarSettingsSchema } from "../../../schemas/calendar.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/plan/calendar",
  operationId: "getCalendarSettings",
  tags: ["Plan"],
  summary: "Calendar times and your subscription links",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(CalendarSettingsSchema, "Calendar settings."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { config }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const household = await em.findOneOrFail(Household, householdId)
    const links = await em.find(
      CalendarSubscription,
      { user: userId, revokedAt: null },
      { orderBy: { createdAt: "DESC" } }
    )
    return c.json(
      {
        ...calendarSettings(household),
        publicUrlReady: !!config.publicUrl,
        links: links.map((link) => ({
          id: link.id,
          createdAt: link.createdAt.toISOString(),
        })),
      },
      200
    )
  })
}
