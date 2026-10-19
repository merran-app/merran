import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { shoppingSwapTargets } from "../../../../../../services/list/substitutions/substitutions.ts"
import { inHousehold } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { ItemParam } from "../../../../../schemas/list.ts"
import { ShoppingTargetsSchema } from "../../../../../schemas/shopping-swaps.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"
const route = createRoute({
  method: "get",
  path: "/list/items/{itemId}/substitutions",
  operationId: "shoppingSwapTargets",
  tags: ["List"],
  summary: "Recipes and planned meals behind a shopping substitution",
  description:
    "Signed-in household members only. Finds actual main-dish and side ingredient lines, scaled to planned servings, with saved meal variants and conflict tokens.",
  request: { params: ItemParam },
  responses: {
    200: jsonResponse(ShoppingTargetsSchema, "Ingredient contexts."),
    404: errorResponse("Item not found."),
    ...SIGNED_IN_ERRORS,
  },
})
export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json(
      await shoppingSwapTargets(em, c.req.valid("param").itemId),
      200
    )
  })
}
