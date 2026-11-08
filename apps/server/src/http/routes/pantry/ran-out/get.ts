import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { ranOutFoods } from "../../../../services/pantry/ran-out.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { RanOutFoodsSchema, RanOutQuery } from "../../../schemas/ran-out.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/pantry/ran-out",
  operationId: "getRanOutFoods",
  tags: ["Pantry"],
  summary: "What could have run out cooking a meal",
  description:
    "The foods a meal's recipe and side take, each once, for asking what ran out: always-on-hand foods like salt among them, water left out. A note meal has none.",
  ...openToKeys("pantry", "read"),
  request: { query: RanOutQuery },
  responses: {
    200: jsonResponse(RanOutFoodsSchema, "What could have run out."),
    404: errorResponse("No such meal."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { meal } = c.req.valid("query")
    return c.json(await ranOutFoods(em, householdId, meal), 200)
  })
}
