import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import { createCalendarSubscription } from "../../../../../services/plan/calendar/subscriptions.ts"
import { inHousehold } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { NewCalendarLinkSchema } from "../../../../schemas/calendar.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/plan/calendar/links",
  operationId: "createCalendarLink",
  tags: ["Plan"],
  summary: "Create a private calendar subscription URL",
  description:
    "The URL is shown once. Anyone with it can read the household meal calendar until it is revoked.",
  security: SESSION_SECURITY,
  responses: {
    201: jsonResponse(NewCalendarLinkSchema, "Created."),
    400: errorResponse("No public URL is configured."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { config }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    if (!config.publicUrl) {
      throw new AppError(
        "invalid",
        "calendar_public_url",
        "Set MERRAN_PUBLIC_URL before creating a subscription link."
      )
    }
    const { link, token } = await createCalendarSubscription(
      em,
      householdId,
      userId
    )
    return c.json(
      {
        id: link.id,
        createdAt: link.createdAt.toISOString(),
        url: `${config.publicUrl}/api/plan/calendar/feed/${token}`,
      },
      201
    )
  })
}
