import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { itemDetails } from "../../../../../../services/list/details.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  ItemParam,
  ListItemDetailsSchema,
} from "../../../../../schemas/list.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/list/items/{itemId}/details",
  operationId: "listItemDetails",
  tags: ["List"],
  summary: "Recipe ingredient lines behind a shopping item",
  description:
    "Current recipe lines for the item's linked planned meals and sides, using the list's food matching and compatible-unit rules. Includes original wording, serving-scaled wording and recorded outstanding meal contributions after pantry deductions. These are current recipe details, not historical snapshots or proof of retailer purchases. Missing or changed recipe details are counted explicitly.",
  ...openToKeys("list", "read"),
  request: { params: ItemParam },
  responses: {
    200: jsonResponse(ListItemDetailsSchema, "The item's recipe lines."),
    404: errorResponse("That isn't on the list."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json(await itemDetails(em, c.req.valid("param").itemId), 200)
  })
}
