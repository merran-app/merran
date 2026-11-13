import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { walmartFilled } from "../../../../../services/stores/walmart/basket.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { WalmartFilledSchema } from "../../../../schemas/walmart.ts"

const route = createRoute({
  method: "post",
  path: "/stores/walmart/filled",
  operationId: "walmartFilled",
  tags: ["Stores"],
  summary: "Say what a Walmart fill put in the cart",
  description:
    "The extension says it's stopped filling the Walmart cart: the fill is done, someone stopped it, it failed, or a fill paused at Walmart's check was dismissed. It says how many products went in and how many it left out since it last said, so a fill that's stopped and carried on counts each product once. Webhooks are told the list was sent. What went in is recorded product by product, as it goes, with the sent route.",
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: WalmartFilledSchema } },
    },
  },
  responses: {
    204: { description: "Noted." },
    422: errorResponse("Walmart isn't turned on on this server."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    await walmartFilled(deps, em, householdId, c.req.valid("json"))
    return c.body(null, 204)
  })
}
