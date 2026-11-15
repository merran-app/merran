import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { describeLinkImport } from "../../../../../../services/recipes/import/import-links.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  LinkImportParam,
  LinkImportSchema,
} from "../../../../../schemas/imports.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/import/links/{importId}",
  operationId: "getLinkImport",
  tags: ["Recipes"],
  summary: "How a link import is going",
  description: "Each link, and where it's got to.",
  ...openToKeys("imports", "read"),
  request: { params: LinkImportParam },
  responses: {
    200: jsonResponse(LinkImportSchema, "The import."),
    404: errorResponse("No such import in this household."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json(
      await describeLinkImport(em, c.req.valid("param").importId),
      200
    )
  })
}
