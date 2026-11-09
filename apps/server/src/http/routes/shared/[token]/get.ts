import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { AppError } from "../../../../core/errors.ts"
import { KeyRateLimit } from "../../../../services/auth/key-rate-limit.ts"
import { describeShared } from "../../../../services/recipes/sharing/shared-recipe.ts"
import { sharedForToken } from "../../../../services/recipes/sharing/shares.ts"
import type { Router } from "../../../router.ts"
import { errorResponse, jsonResponse } from "../../../schemas/responses.ts"
import { SharedRecipeSchema } from "../../../schemas/sharing.ts"

const route = createRoute({
  method: "get",
  path: "/shared/{token}",
  operationId: "getSharedRecipe",
  tags: ["Sharing"],
  summary: "Read a shared recipe",
  description:
    "No sign-in: the link's token alone grants read access to this one recipe, and only the fields in the answer. Every way a link can fail, from never made to stopped, gets the same 404.",
  security: [],
  request: {
    params: z.object({
      token: z.string().openapi({ param: { name: "token", in: "path" } }),
    }),
  },
  responses: {
    200: jsonResponse(SharedRecipeSchema, "The recipe."),
    404: errorResponse("This recipe isn't shared."),
    429: errorResponse("Too many reads of this link."),
  },
})

const readLimit = new KeyRateLimit(120)

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const token = c.req.valid("param").token
    const shared = await sharedForToken(c.var.em, token, {
      logger: c.var.logger,
    })
    c.header("Cache-Control", "no-store")
    c.header("Referrer-Policy", "no-referrer")
    if (!shared) {
      return c.json(
        { error: { code: "not_found", message: "This recipe isn't shared." } },
        404
      )
    }

    const hit = readLimit.hit(shared.token)
    if (!hit.ok) {
      c.header("Retry-After", String(hit.retryAfter))
      throw new AppError(
        "rate_limited",
        "shared_rate_limited",
        "Try this link again later."
      )
    }

    return c.json(
      describeShared(shared.recipe, shared.household.name, shared.token),
      200
    )
  })
}
