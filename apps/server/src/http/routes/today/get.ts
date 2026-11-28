import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { forHousehold } from "../../../database/scope.ts"
import { todaySummary } from "../../../services/today/summary.ts"
import { OPEN_TO_READERS, readingHousehold } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../schemas/responses.ts"
import { TodaySchema } from "../../schemas/today.ts"

const route = createRoute({
  method: "get",
  path: "/today",
  operationId: "getToday",
  tags: ["Today"],
  summary: "Today at a glance",
  description:
    "What's left to buy, what to use soon, and recipes to cook again, in one request. An API key gets the parts it can read, and the others are null; a key that can read none of the list, the pantry or the recipes is refused with 403.",
  ...OPEN_TO_READERS,
  responses: {
    200: jsonResponse(TodaySchema, "What Today shows."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId, readable } = readingHousehold(c, [
      "list",
      "pantry",
      "recipes",
    ])
    const em = forHousehold(c.var.em, householdId)
    return c.json(await todaySummary(em, householdId, new Set(readable)), 200)
  })
}
