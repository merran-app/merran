import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { stopSharing } from "../../../../../services/recipes/sharing/shares.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { RecipeParam } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/recipes/{recipe}/share",
  operationId: "stopSharingRecipe",
  tags: ["Recipes"],
  summary: "Stop sharing a recipe",
  description:
    "Ends its link at once. Sharing it again makes a new link, and the old one stays dead.",
  ...openToKeys("recipes", "read"),
  request: { params: RecipeParam },
  responses: {
    204: { description: "Not shared anymore." },
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    await stopSharing(em, c.req.valid("param").recipe)
    return c.body(null, 204)
  })
}
