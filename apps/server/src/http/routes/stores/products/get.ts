import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { productMappings } from "../../../../services/stores/mappings.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"
import { ProductMappingsSchema } from "../../../schemas/stores.ts"

const route = createRoute({
  method: "get",
  path: "/stores/products",
  operationId: "getProductMappings",
  tags: ["Stores"],
  summary: "Foods and products the household buys at its stores",
  description:
    "Foods used in recipes, lists, the pantry or purchases, plus existing mappings. Products are kept separately for each connected store.",
  ...openToKeys("list", "read"),
  responses: {
    200: jsonResponse(
      ProductMappingsSchema,
      "The household's foods and products."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await productMappings(deps, em, householdId), 200)
  })
}
