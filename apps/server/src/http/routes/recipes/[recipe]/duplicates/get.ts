import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { duplicatesOf } from "../../../../../services/recipes/duplicates.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  RecipeDuplicatesSchema,
  RecipeParam,
} from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/{recipe}/duplicates",
  operationId: "listRecipeDuplicates",
  tags: ["Recipes"],
  summary: "A recipe's possible duplicates",
  description:
    "The household's other recipes that may be the same one: the same page under any address first, then the same words in their names. Pairs someone said aren't the same, and recipes in Recently deleted, are left out. No AI is used.",
  ...openToKeys("recipes", "read"),
  request: { params: RecipeParam },
  responses: {
    200: jsonResponse(RecipeDuplicatesSchema, "Its possible duplicates."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const recipe = c.req.valid("param").recipe
    return c.json({ duplicates: await duplicatesOf(em, recipe) }, 200)
  })
}
