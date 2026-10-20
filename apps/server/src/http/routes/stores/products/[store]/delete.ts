import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import {
  forgetProductMapping,
  mappingFood,
} from "../../../../../services/stores/mappings.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { SIGNED_IN_ERRORS } from "../../../../schemas/responses.ts"
import {
  MappingFoodQuery,
  MappingStoreParam,
} from "../../../../schemas/stores.ts"

const route = createRoute({
  method: "delete",
  path: "/stores/products/{store}",
  operationId: "forgetProductMapping",
  tags: ["Stores"],
  summary: "Forget the selected product for one food at one store",
  description:
    "A future basket can suggest another product. Other stores and past sent-cart records stay as they are.",
  ...openToKeys("list", "write"),
  request: { params: MappingStoreParam, query: MappingFoodQuery },
  responses: {
    204: { description: "Forgotten." },
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const { store } = c.req.valid("param")
    const food = await mappingFood(em, c.req.valid("query").food)
    await forgetProductMapping(em, store, food)
    return c.body(null, 204)
  })
}
