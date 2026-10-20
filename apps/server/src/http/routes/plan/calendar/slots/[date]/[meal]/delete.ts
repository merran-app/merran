import { createRoute } from "@hono/zod-openapi"
import { isDay, MEALS } from "@merran/shared"
import type { AppDeps } from "../../../../../../../core/context.ts"
import { AppError } from "../../../../../../../core/errors.ts"
import { PlanSlotTime } from "../../../../../../../database/entities/index.ts"
import { inHousehold, openToKeys } from "../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../router.ts"
import { CalendarSlotParam } from "../../../../../../schemas/calendar.ts"
import { SIGNED_IN_ERRORS } from "../../../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/plan/calendar/slots/{date}/{meal}",
  operationId: "resetCalendarSlotTime",
  tags: ["Plan"],
  summary: "Use the default time for this day's meal",
  ...openToKeys("plan", "write"),
  request: { params: CalendarSlotParam },
  responses: { 204: { description: "Reset." }, ...SIGNED_IN_ERRORS },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const { date, meal } = c.req.valid("param")
    if (!isDay(date))
      throw new AppError("invalid", "bad_day", "That isn't a day.")
    const chosenMeal = MEALS.find((value) => value === meal)
    if (!chosenMeal)
      throw new AppError("invalid", "bad_meal", "That isn't a meal type.")
    await em.nativeDelete(PlanSlotTime, { date, meal: chosenMeal })
    return c.body(null, 204)
  })
}
