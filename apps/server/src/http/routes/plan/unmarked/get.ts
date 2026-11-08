import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { toAsk } from "../../../../services/plan/plan.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { PlanEntriesSchema } from "../../../schemas/plan.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/plan/unmarked",
  operationId: "getUnmarkedMeals",
  tags: ["Plan"],
  summary: "Past meals nobody marked",
  description:
    "Recipe meals still planned from the past six days, and the pool of a week that ended in that time, oldest first: whether they were made is worth asking, since the pantry keeps their food set aside for six days. Note meals aren't included. Answer by marking them cooked or skipped; a meal from a day gone by that's marked cooked counts as cooked on its day, at midday in the household's time zone.",
  ...openToKeys("plan", "read"),
  responses: {
    200: jsonResponse(PlanEntriesSchema, "The meals to ask about."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json({ entries: await toAsk(em, householdId) }, 200)
  })
}
