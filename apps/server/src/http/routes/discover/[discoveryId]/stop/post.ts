import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { stopDiscovery } from "../../../../../services/recipes/discover/discover.ts"
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
  path: "/discover/{discoveryId}/stop",
  operationId: "stopDiscovery",
  tags: ["Discover"],
  summary: "Stop a search",
  description:
    "What it has found stays, and its status becomes `stopped`. `POST /discover/{discoveryId}/more` carries on from there.",
  ...openToKeys("recipes", "write"),
  request: { params: DiscoveryParam },
  responses: {
    200: jsonResponse(DiscoverySchema, "Stopped."),
    404: errorResponse("No such search."),
    409: errorResponse("It has already finished."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { jobs }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const discovery = await stopDiscovery(
      jobs,
      em,
      householdId,
      c.req.valid("param").discoveryId
    )
    return c.json(discovery, 200)
  })
}
