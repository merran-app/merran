import { createRoute, z } from "@hono/zod-openapi"
import { clockIn } from "@merran/shared"
import type { AppDeps } from "../../../../../../core/context.ts"
import { AppError } from "../../../../../../core/errors.ts"
import { forHousehold } from "../../../../../../database/scope.ts"
import { KeyRateLimit } from "../../../../../../services/auth/key-rate-limit.ts"
import { calendarFeed } from "../../../../../../services/plan/calendar/ical.ts"
import { calendarForToken } from "../../../../../../services/plan/calendar/subscriptions.ts"
import type { Router } from "../../../../../router.ts"
import { errorResponse } from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/plan/calendar/feed/{token}",
  operationId: "getCalendarFeed",
  tags: ["Plan"],
  summary: "Read a meal calendar subscription",
  description:
    "The URL token alone grants read access to meal names and notes. Keep it private. Calendar clients control refresh timing.",
  security: [],
  request: {
    params: z.object({
      token: z.string().openapi({ param: { name: "token", in: "path" } }),
    }),
  },
  responses: {
    200: {
      description: "Current iCalendar feed.",
      content: { "text/calendar": { schema: z.string() } },
    },
    404: errorResponse("No active subscription."),
    429: errorResponse("Too many calendar requests."),
  },
})

const feedLimit = new KeyRateLimit(120)

export default (router: Router, { config }: AppDeps) => {
  router.openapi(route, async (c) => {
    const token = c.req.valid("param").token
    const household = /^[A-Za-z0-9_-]{43}$/.test(token)
      ? await calendarForToken(c.var.em, token)
      : null
    c.header("Cache-Control", "no-store")
    c.header("Referrer-Policy", "no-referrer")
    if (!household) {
      return c.json(
        { error: { code: "not_found", message: "No active subscription." } },
        404
      )
    }
    const hit = feedLimit.hit(household.id)
    if (!hit.ok) {
      c.header("Retry-After", String(hit.retryAfter))
      throw new AppError(
        "rate_limited",
        "calendar_rate_limited",
        "Try the calendar again later."
      )
    }
    const em = forHousehold(c.var.em, household.id)
    const base = config.publicUrl ?? new URL(c.req.url).origin
    const text = await calendarFeed(
      em,
      household,
      base,
      clockIn(household.timeZone).today
    )
    return c.body(text, 200, { "Content-Type": "text/calendar; charset=utf-8" })
  })
}
