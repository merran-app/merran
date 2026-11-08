import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { ranOut } from "../../../../services/pantry/ran-out.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { RanOutResultSchema, RanOutSchema } from "../../../schemas/ran-out.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/pantry/ran-out",
  operationId: "ranOut",
  tags: ["Pantry"],
  summary: "Say what ran out cooking a meal",
  description:
    "Everything of each food at home is used up, except what's in the freezer, unless cooking the meal took that food from the freezer. With `list`, each goes on the list as a plain line for no meal, unless it's on already: always-on-hand foods too. What the meal took when it was cooked stays as it was, so marking it not cooked later doesn't bring back what ran out. It takes the pantry permission, though it adds to the list.",
  ...openToKeys("pantry", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: RanOutSchema } },
    },
  },
  responses: {
    200: jsonResponse(RanOutResultSchema, "Used up, and listed."),
    404: errorResponse("No such meal."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await ranOut(em, householdId, c.req.valid("json")), 200)
  })
}
