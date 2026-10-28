import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { notAtHome } from "../../../../../../services/list/covered.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { ForMealsResultSchema } from "../../../../../schemas/list.ts"
import { PantryItemParam } from "../../../../../schemas/pantry.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/list/covered/{itemId}/not-at-home",
  operationId: "notAtHome",
  tags: ["List"],
  summary: "It isn't at home after all",
  description:
    "The thing at home is used up, and everything it was set aside for planned meals on the list still to come goes on the list. The answer says what the list and the pantry were, for Undo with /list/restore and /pantry/restore.",
  ...openToKeys("list", "write"),
  request: { params: PantryItemParam },
  responses: {
    200: jsonResponse(ForMealsResultSchema, "On the list."),
    404: errorResponse("Not in the pantry."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { itemId } = c.req.valid("param")
    return c.json(await notAtHome(em, householdId, itemId), 200)
  })
}
