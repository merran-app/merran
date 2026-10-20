import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import {
  CalendarSubscription,
  Household,
} from "../../../../database/entities/index.ts"
import { changeCalendarSettings } from "../../../../services/plan/calendar/subscriptions.ts"
import { asHouseholdAdmin } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  CalendarSettingsChangesSchema,
  CalendarSettingsSchema,
} from "../../../schemas/calendar.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "patch",
  path: "/plan/calendar",
  operationId: "updateCalendarSettings",
  tags: ["Plan"],
  summary: "Change household calendar times or enable the feed",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: {
        "application/json": { schema: CalendarSettingsChangesSchema },
      },
    },
  },
  responses: {
    200: jsonResponse(CalendarSettingsSchema, "Changed."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { config }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = asHouseholdAdmin(c)
    const household = await em.findOneOrFail(Household, householdId)
    const settings = await changeCalendarSettings(
      em,
      household,
      c.req.valid("json")
    )
    const links = await em.find(CalendarSubscription, {
      user: userId,
      revokedAt: null,
    })
    return c.json(
      {
        ...settings,
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
