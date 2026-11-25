import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { AppError } from "../../../../../../core/errors.ts"
import { findDiscovery } from "../../../../../../services/recipes/discover/discover.ts"
import { foundPhotoPath } from "../../../../../../services/recipes/discover/photos.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { DiscoveryPhotoParam } from "../../../../../schemas/discover.ts"
import {
  errorResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/discover/{discoveryId}/photos/{photo}",
  operationId: "getDiscoveryPhoto",
  tags: ["Discover"],
  summary: "A found recipe's photo",
  description:
    "A small copy, as WebP, kept by Merran when the search found the recipe, so Discover doesn't load photos from other sites.",
  ...openToKeys("recipes", "read"),
  request: { params: DiscoveryPhotoParam },
  responses: {
    200: {
      description: "The photo.",
      content: {
        "image/webp": { schema: z.string().openapi({ format: "binary" }) },
      },
    },
    404: errorResponse("No such search, or it has no such photo."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { discoveryId, photo } = c.req.valid("param")
    const discovery = await findDiscovery(em, discoveryId)
    // Only a photo the search says it kept: the path is never built from
    // whatever's asked for.
    const kept = discovery.recipes.some((recipe) => recipe.photoKey === photo)
    const file = kept
      ? await deps.files.read(foundPhotoPath(householdId, discovery.id, photo))
      : null
    if (!file) {
      throw new AppError("not_found", "no_photo", "That recipe has no photo.")
    }
    c.header("Content-Type", "image/webp")
    c.header("Cache-Control", "private, max-age=604800")
    return c.body(new Uint8Array(file), 200)
  })
}
