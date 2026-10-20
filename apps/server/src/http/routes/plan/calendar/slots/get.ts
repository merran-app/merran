import { createRoute, z } from "@hono/zod-openapi"
import { daysBetween, isDay } from "@merran/shared"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import { PlanSlotTime } from "../../../../../database/entities/index.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  CalendarSlotQuery,
  CalendarSlotSchema,
} from "../../../../schemas/calendar.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/plan/calendar/slots",
  operationId: "getCalendarSlotTimes",
  tags: ["Plan"],
  summary: "One-off meal times for a date range",
  ...openToKeys("plan", "read"),
  request: { query: CalendarSlotQuery },
  responses: {
    200: jsonResponse(
      z.object({ slots: z.array(CalendarSlotSchema) }).openapi({
        example: {
          slots: [
            { date: "2026-10-19", meal: "dinner", start: "19:30", minutes: 60 },
          ],
        },
      }),
      "Overrides."
    ),
    400: errorResponse("Invalid range."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const { from, to } = c.req.valid("query")
    if (
      !isDay(from) ||
      !isDay(to) ||
      daysBetween(from, to) < 0 ||
      daysBetween(from, to) > 62
    ) {
      throw new AppError("invalid", "calendar_range", "Ask for up to 62 days.")
    }
    const slots = await em.find(PlanSlotTime, {
      date: { $gte: from, $lte: to },
    })
    return c.json(
      {
        slots: slots.map(({ date, meal, start, minutes }) => ({
          date,
          meal,
          start,
          minutes,
        })),
      },
      200
    )
  })
}
