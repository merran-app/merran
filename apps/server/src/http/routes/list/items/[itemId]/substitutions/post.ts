import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { applyShoppingSwap } from "../../../../../../services/list/substitutions/substitutions.ts"
import { inHousehold } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { ItemParam } from "../../../../../schemas/list.ts"
import {
  ShoppingSwapInputSchema,
  ShoppingSwapResultSchema,
} from "../../../../../schemas/shopping-swaps.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"
const route = createRoute({
  method: "post",
  path: "/list/items/{itemId}/substitutions",
  operationId: "applyShoppingSwap",
  tags: ["List"],
  summary: "Apply a replacement to selected planned meals",
  description:
    "Signed-in household members only. Atomically saves meal-specific recipe snapshots and recalculates changed shopping foods with pantry deductions, preserving purchases and manual remainders. Library changes require saveToLibrary. Returns conditional Undo data.",
  request: {
    params: ItemParam,
    body: {
      required: true,
      content: { "application/json": { schema: ShoppingSwapInputSchema } },
    },
  },
  responses: {
    200: jsonResponse(ShoppingSwapResultSchema, "Replacement applied."),
    400: errorResponse("Invalid replacement."),
    404: errorResponse("Item or meal not found."),
    409: errorResponse("The list, meal or recipe changed; review again."),
    ...SIGNED_IN_ERRORS,
  },
})
export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    return c.json(
      await applyShoppingSwap(
        em,
        householdId,
        userId,
        c.req.valid("param").itemId,
        c.req.valid("json")
      ),
      200
    )
  })
}
