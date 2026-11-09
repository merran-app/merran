import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import {
  shareRecipe,
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
import { RecipeShareSchema } from "../../../../schemas/sharing.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/{recipe}/share",
  operationId: "shareRecipe",
  tags: ["Recipes"],
  summary: "Share a recipe by link",
  description:
    "Returns the recipe's link, making one if it has none. Anyone with the link can see and cook the recipe, but not change it.",
  ...openToKeys("recipes", "read"),
  request: { params: RecipeParam },
  responses: {
    200: jsonResponse(RecipeShareSchema, "The recipe's link."),
    400: errorResponse("No public URL is configured."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
    403: errorResponse(
      "Not allowed: the household has turned off sharing by link."
    ),
  },
})

export default (router: Router, { config }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    if (!config.publicUrl) {
      throw new AppError(
        "invalid",
        "share_public_url",
        "Set MERRAN_PUBLIC_URL before sharing recipes by link."
      )
    }
    const share = await shareRecipe(
      em,
      householdId,
      userId,
      c.req.valid("param").recipe
    )
    return c.json(
      {
        url: shareUrl(config.publicUrl, share.token),
        createdAt: share.createdAt.toISOString(),
      },
      200
    )
  })
}
