import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import {
  languageOf,
  siteSuggestions,
} from "../../../../services/recipes/discover/sites/sites.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"
import { SiteSuggestionsSchema } from "../../../schemas/sites.ts"

const route = createRoute({
  method: "get",
  path: "/sites/suggestions",
  operationId: "listSiteSuggestions",
  tags: ["Sites"],
  summary: "Suggested recipe sites",
  description:
    "How many recipe sites the household follows, and suggested sites it doesn't follow yet, without their recipes: a lighter GET /api/sites for asking whether to suggest some.",
  ...openToKeys("recipes", "read"),
  responses: {
    200: jsonResponse(SiteSuggestionsSchema, "Its suggestions."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, userId } = inHousehold(c)
    return c.json(await siteSuggestions(em, await languageOf(em, userId)), 200)
  })
}
