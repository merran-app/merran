import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { siteRecipes } from "../../../../../services/recipes/discover/sites/sites.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import {
  SiteParam,
  PageQuerySchema,
  SiteRecipesPageSchema,
} from "../../../../schemas/sites.ts"

const route = createRoute({
  method: "get",
  path: "/sites/{site}/recipes",
  operationId: "listFollowedSiteRecipes",
  tags: ["Sites"],
  summary: "A followed site's recipes",
  description:
    "A page of the site's recipes, newest first, as `GET /sites` lists them: for Show more after the newest 24 it gives. Merran keeps a site's newest 120.",
  ...openToKeys("recipes", "read"),
  request: { params: SiteParam, query: PageQuerySchema },
  responses: {
    200: jsonResponse(SiteRecipesPageSchema, "A page of its recipes."),
    404: errorResponse("The household doesn't follow that site."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const page = await siteRecipes(
      em,
      householdId,
      c.req.valid("param").site,
      c.req.valid("query")
    )
    return c.json(page, 200)
  })
}
