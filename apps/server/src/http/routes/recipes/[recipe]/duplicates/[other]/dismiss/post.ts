import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import { dismissDuplicate } from "../../../../../../../services/recipes/duplicates.ts"
import { inHousehold, openToKeys } from "../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../router.ts"
import { DuplicateParam } from "../../../../../../schemas/recipes.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/{recipe}/duplicates/{other}/dismiss",
  operationId: "dismissDuplicate",
  tags: ["Recipes"],
  summary: "Say two recipes aren't the same",
  description:
    "Keeps the two as not the same, for everyone in the household, so they aren't shown as possible duplicates again. Saying so twice is fine.",
  ...openToKeys("recipes", "write"),
  request: { params: DuplicateParam },
  responses: {
    204: { description: "Kept as not the same." },
    400: errorResponse("They're the same recipe."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, userId } = inHousehold(c)
    const { recipe, other } = c.req.valid("param")
    await dismissDuplicate(em, recipe, other, userId)
    return c.body(null, 204)
  })
}
