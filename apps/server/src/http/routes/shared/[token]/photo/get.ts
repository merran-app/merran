import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import { KeyRateLimit } from "../../../../../services/auth/key-rate-limit.ts"
import { readPhoto } from "../../../../../services/recipes/photos/photos.ts"
import { sharedForToken } from "../../../../../services/recipes/sharing/shares.ts"
import type { Router } from "../../../../router.ts"
import { errorResponse } from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/shared/{token}/photo",
  operationId: "getSharedRecipePhoto",
  tags: ["Sharing"],
  summary: "A shared recipe's photo",
  description:
    "As WebP, with no sign-in: `full` for the page, or `card` for previews. Use the links in the recipe's `photo`.",
  security: [],
  request: {
    params: z.object({
      token: z.string().openapi({ param: { name: "token", in: "path" } }),
    }),
    query: z.object({
      size: z.enum(["full", "card"]).default("full"),
      v: z.string().optional().openapi({
        description: "Which photo: the links in `photo` say.",
      }),
    }),
  },
  responses: {
    200: {
      description: "The photo.",
      content: {
        "image/webp": { schema: z.string().openapi({ format: "binary" }) },
      },
    },
    404: errorResponse("This recipe isn't shared, or it has no photo."),
    429: errorResponse("Too many reads of this link."),
  },
})

const photoLimit = new KeyRateLimit(120)

const notShared = () =>
  new AppError("not_found", "not_found", "This recipe isn't shared.")

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { token } = c.req.valid("param")
    const { size, v } = c.req.valid("query")
    c.header("Referrer-Policy", "no-referrer")
    // A failure is never cached; a photo named by its link is, below.
    c.header("Cache-Control", "no-store")

    // Loading the photo isn't opening the link, so it isn't noted.
    const shared = await sharedForToken(c.var.em, token, { noteOpened: false })
    if (!shared) throw notShared()

    const hit = photoLimit.hit(shared.token)
    if (!hit.ok) {
      c.header("Retry-After", String(hit.retryAfter))
      throw new AppError(
        "rate_limited",
        "shared_rate_limited",
        "Try this link again later."
      )
    }

    const { recipe, household } = shared
    if (!recipe.image) throw notShared()
    const photo = await readPhoto(files, household.id, recipe.image, size)
    if (!photo) throw notShared()

    c.header("Content-Type", "image/webp")
    // A link naming this photo always shows it, so a browser can keep it for
    // good. It's private, so no shared cache or CDN outlives a stopped link.
    if (v === recipe.image) {
      c.header("Cache-Control", "private, max-age=31536000, immutable")
    }
    return c.body(new Uint8Array(photo), 200)
  })
}
