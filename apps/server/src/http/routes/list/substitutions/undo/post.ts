import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { undoShoppingSwap } from "../../../../../services/list/substitutions/substitutions.ts"
import { inHousehold } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { ShoppingUndoSchema } from "../../../../schemas/shopping-swaps.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
const route = createRoute({
  method: "post",
  path: "/list/substitutions/undo",
  operationId: "undoShoppingSwap",
  tags: ["List"],
  summary: "Undo a shopping substitution",
  description:
    "Signed-in household members only. Restores meal variants and changed quantities if the meals and optional library recipe still match the returned Undo revisions. Bought items are preserved.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ShoppingUndoSchema } },
    },
  },
  responses: {
    200: jsonResponse(
      z.object({ done: z.boolean() }).openapi({ example: { done: true } }),
      "Undone."
    ),
    404: errorResponse("Item or meal no longer exists."),
    409: errorResponse("Someone changed it since."),
    ...SIGNED_IN_ERRORS,
  },
})
export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    return c.json(
      await undoShoppingSwap(em, householdId, userId, c.req.valid("json")),
      200
    )
  })
}
