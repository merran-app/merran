import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import { saveKrogerProduct } from "../../../../../services/stores/kroger/basket.ts"
import { mappingFood } from "../../../../../services/stores/mappings.ts"
import { saveWalmartProduct } from "../../../../../services/stores/walmart/basket.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import {
  MappingStoreParam,
  ProductMappingSchema,
} from "../../../../schemas/stores.ts"
import { SaveProductMappingSchema } from "../../../../schemas/walmart.ts"

const route = createRoute({
  method: "put",
  path: "/stores/products/{store}",
  operationId: "saveProductMapping",
  tags: ["Stores"],
  summary: "Choose what the household buys for a food at one store",
  description:
    "A product selected here is used on future lists for the same household food, whether or not it is on a list now. Kroger takes a product ID; Walmart takes a product read by the extension.",
  ...openToKeys("list", "write"),
  request: {
    params: MappingStoreParam,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: SaveProductMappingSchema,
          example: { food: "milk", productId: "0001111041700" },
        },
      },
    },
  },
  responses: {
    200: jsonResponse(ProductMappingSchema, "The saved product."),
    404: errorResponse("The Kroger product isn't at this store."),
    422: errorResponse("The store isn't available."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { store } = c.req.valid("param")
    const body = c.req.valid("json")
    const food = await mappingFood(em, body.food)
    if (store === "kroger" && "productId" in body) {
      const row = await saveKrogerProduct(deps, em, {
        householdId,
        food,
        productId: body.productId,
      })
      return c.json(
        {
          food,
          store,
          product: row.product,
          chosen: row.chosen,
          updatedAt: row.updatedAt.toISOString(),
        },
        200
      )
    }
    if (store === "walmart" && "product" in body) {
      const row = await saveWalmartProduct(deps, em, {
        householdId,
        food,
        product: body.product,
      })
      return c.json(
        {
          food,
          store,
          product: row.product,
          chosen: row.chosen,
          updatedAt: row.updatedAt.toISOString(),
        },
        200
      )
    }
    throw new AppError(
      "invalid",
      "store_product_invalid",
      "Choose a product from this store."
    )
  })
}
