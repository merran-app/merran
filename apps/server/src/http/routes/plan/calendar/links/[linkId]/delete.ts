import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { CalendarSubscription } from "../../../../../../database/entities/index.ts"
import { inHousehold } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { CalendarLinkParam } from "../../../../../schemas/calendar.ts"
import {
  errorResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/plan/calendar/links/{linkId}",
  operationId: "revokeCalendarLink",
  tags: ["Plan"],
  summary: "Revoke one of your calendar links",
  security: SESSION_SECURITY,
  request: { params: CalendarLinkParam },
  responses: {
    204: { description: "Revoked." },
    404: errorResponse("No such link."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, userId } = inHousehold(c)
    const link = await em.findOne(CalendarSubscription, {
      id: c.req.valid("param").linkId,
      user: userId,
      revokedAt: null,
    })
    if (!link)
      return c.json(
        { error: { code: "not_found", message: "No such link." } },
        404
      )
    link.revokedAt = new Date()
    await em.flush()
    return c.body(null, 204)
  })
}
