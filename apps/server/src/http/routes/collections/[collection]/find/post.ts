import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import {
  findMore,
  startDiscovery,
} from "../../../../../services/recipes/discover/discover.ts"
import { getCollection } from "../../../../../services/recipes/discover/sites/collections.ts"
import { languageOf } from "../../../../../services/recipes/discover/sites/sites.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { DiscoverySchema } from "../../../../schemas/discover.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { CollectionParam } from "../../../../schemas/sites.ts"

const route = createRoute({
  method: "post",
  path: "/collections/{collection}/find",
  operationId: "findMoreForCollection",
  tags: ["Collections"],
  summary: "Find more for a collection",
  description:
    "Adds to the collection's last search when it has one, and starts a search for its theme otherwise, as `POST /discover` does: matches from the shelf at once, and more from the web, kept with the collection (its `found`). Needs a model that can search the web.",
  ...openToKeys("recipes", "write"),
  request: { params: CollectionParam },
  responses: {
    202: jsonResponse(DiscoverySchema, "Searching."),
    404: errorResponse("No such collection."),
    409: errorResponse("A search is going already."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const collection = await getCollection(
      em,
      householdId,
      await languageOf(em, userId),
      c.req.valid("param").collection
    )
    const avoid = collection.recipes.map((recipe) => recipe.name)
    // Its last search carries on with another round; with none yet, one starts.
    const discovery = collection.found
      ? await findMore(deps, em, {
          householdId,
          userId,
          discoveryId: collection.found.id,
          avoid,
        })
      : await startDiscovery(deps, em, {
          householdId,
          userId,
          theme: collection.theme,
          collection: collection.id,
          avoid,
        })
    return c.json(discovery, 202)
  })
}
