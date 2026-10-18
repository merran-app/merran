import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { sendPlan } from "../../../../services/stores/yours.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"
import { SendPlanQuery, SendPlanSchema } from "../../../schemas/stores.ts"

const route = createRoute({
  method: "get",
  path: "/stores/send-plan",
  operationId: "sendPlan",
  tags: ["Stores"],
  summary: "Where each thing on a list can go",
  description:
    "Shopping progress for one list: connected stores and cart links, selected products, and successful transfers with their original pack counts, products and times. Changed items/products and older transfers without snapshots require cart review. Sending does not mark an item bought or confirm checkout. Each store's part can be reviewed and sent with its basket's `items`.",
  ...openToKeys("list", "read"),
  request: { query: SendPlanQuery },
  responses: {
    200: jsonResponse(SendPlanSchema, "Where each thing can go."),
    404: errorResponse("There's no such list."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { list } = c.req.valid("query")
    return c.json(await sendPlan(deps, em, householdId, list), 200)
  })
}
