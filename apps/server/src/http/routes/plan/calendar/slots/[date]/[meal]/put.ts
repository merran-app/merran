import { createRoute } from "@hono/zod-openapi"
import { isDay, MEALS } from "@merran/shared"
import type { AppDeps } from "../../../../../../../core/context.ts"
import { AppError } from "../../../../../../../core/errors.ts"
import { PlanSlotTime } from "../../../../../../../database/entities/index.ts"
import { inHousehold, openToKeys } from "../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../router.ts"
import {
  CalendarSlotParam,
  CalendarSlotSchema,
  MealTimeSchema,
} from "../../../../../../schemas/calendar.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../../schemas/responses.ts"

const route = createRoute({
  method: "put",
  path: "/plan/calendar/slots/{date}/{meal}",
  operationId: "setCalendarSlotTime",
  tags: ["Plan"],
  summary: "Set one day's meal time",
  ...openToKeys("plan", "write"),
  request: {
    params: CalendarSlotParam,
    body: {
      required: true,
      content: { "application/json": { schema: MealTimeSchema } },
    },
  },
  responses: {
    200: jsonResponse(CalendarSlotSchema, "Changed."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { date, meal } = c.req.valid("param")
    if (!isDay(date))
      throw new AppError("invalid", "bad_day", "That isn't a day.")
    const chosenMeal = MEALS.find((value) => value === meal)
    if (!chosenMeal)
      throw new AppError("invalid", "bad_meal", "That isn't a meal type.")
    const { start, minutes } = c.req.valid("json")
    let slot = await em.findOne(PlanSlotTime, { date, meal: chosenMeal })
    if (slot) {
      slot.start = start
      slot.minutes = minutes
    } else {
      slot = em.create(PlanSlotTime, {
        household: householdId,
        date,
        meal: chosenMeal,
        start,
        minutes,
      })
    }
    await em.flush()
    return c.json({ date, meal: chosenMeal, start, minutes }, 200)
  })
}
