import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { listImports } from "../../../services/imports/describe.ts"
import { inHousehold, openToKeys } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { ImportListSchema } from "../../schemas/import-history.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/imports",
  operationId: "listImports",
  tags: ["Imports"],
  summary: "The household's imports",
  description:
    "Every import the household made in the last 90 days, newest first: several links, starter collections, other apps, Merran exports, and a single link or video that went on in the background. Everyone who can add recipes sees them all.",
  ...openToKeys("imports", "read"),
  responses: {
    200: jsonResponse(ImportListSchema, "The imports."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json({ imports: await listImports(em) }, 200)
  })
}
