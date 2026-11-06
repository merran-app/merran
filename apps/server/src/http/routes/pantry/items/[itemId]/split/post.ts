import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { splitItem } from "../../../../../../services/pantry/pantry.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  PantryItemParam,
  PantrySplitResultSchema,
  PantrySplitSchema,
} from "../../../../../schemas/pantry.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/pantry/items/{itemId}/split",
  operationId: "splitPantryItem",
  tags: ["Pantry"],
  summary: "Move some of something",
  description:
    "Moves part of something at home to the fridge, freezer or cupboard, joining the same food already kept there. The rest stays where it was, with its use-by date and the meals it's set aside for. What moves to the freezer has no use-by date.",
  ...openToKeys("pantry", "write"),
  request: {
    params: PantryItemParam,
    body: {
      required: true,
      content: { "application/json": { schema: PantrySplitSchema } },
    },
  },
  responses: {
    200: jsonResponse(PantrySplitResultSchema, "Split."),
    400: errorResponse(
      "The amount isn't one there is less of, or the item has no amount to split."
    ),
    404: errorResponse("Not in the pantry."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { itemId } = c.req.valid("param")
    return c.json(
      await splitItem(em, householdId, itemId, c.req.valid("json")),
      200
    )
  })
}
