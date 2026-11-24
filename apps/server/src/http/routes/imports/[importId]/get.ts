import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import {
  describeImport,
  findImport,
} from "../../../../services/imports/describe.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  ImportDetailSchema,
  ImportPagesQuery,
  ImportParam,
} from "../../../schemas/import-history.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/imports/{importId}",
  operationId: "getImport",
  tags: ["Imports"],
  summary: "One of the household's imports",
  description:
    "How it's going or went: its links in order, for several links or a collection, and the recipes it brought in, what was already there and what didn't come in and why, 100 of each at a time.",
  ...openToKeys("imports", "read"),
  request: { params: ImportParam, query: ImportPagesQuery },
  responses: {
    200: jsonResponse(ImportDetailSchema, "The import."),
    404: errorResponse("No such import in this household."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const record = await findImport(em, c.req.valid("param").importId)
    return c.json(await describeImport(em, record, c.req.valid("query")), 200)
  })
}
