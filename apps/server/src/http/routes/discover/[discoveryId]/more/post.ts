import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { findMore } from "../../../../../services/recipes/discover/discover.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  DiscoveryParam,
  DiscoverySchema,
} from "../../../../schemas/discover.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/discover/{discoveryId}/more",
  operationId: "findMoreDiscoveries",
  tags: ["Discover"],
  summary: "Find more for a search",
  description:
    "Adds a round to the search, which searches again: up to four more matches from the shelf of recipes Merran reads, which come back at once, and up to eight more from the web, saved as each page opens. It looks for other dishes than the search has. Follow it at `GET /discover/{discoveryId}`; one search at a time for a household.",
  ...openToKeys("recipes", "write"),
  request: { params: DiscoveryParam },
  responses: {
    202: jsonResponse(DiscoverySchema, "Searching again."),
    404: errorResponse("No such search."),
    409: errorResponse("A search is going already."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const discovery = await findMore(deps, em, {
      householdId,
      userId,
      discoveryId: c.req.valid("param").discoveryId,
    })
    return c.json(discovery, 202)
  })
}
