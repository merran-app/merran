import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import {
  shareOf,
  shareUrl,
} from "../../../../../services/recipes/sharing/shares.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { RecipeParam } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { RecipeShareStatusSchema } from "../../../../schemas/sharing.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/{recipe}/share",
  operationId: "getRecipeShare",
  tags: ["Recipes"],
  summary: "See whether a recipe is shared by link",
  ...openToKeys("recipes", "read"),
  request: { params: RecipeParam },
  responses: {
    200: jsonResponse(
      RecipeShareStatusSchema,
      "Its link, or null while it isn't shared."
    ),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { config }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const share = await shareOf(em, c.req.valid("param").recipe)
    if (!share || !config.publicUrl) return c.json({ share: null }, 200)
    return c.json(
      {
        share: {
          url: shareUrl(config.publicUrl, share.token),
          createdAt: share.createdAt.toISOString(),
        },
      },
      200
    )
  })
}
