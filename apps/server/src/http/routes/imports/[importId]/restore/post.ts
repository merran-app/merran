import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import {
  findImport,
  importSummary,
} from "../../../../../services/imports/describe.ts"
import { restoreImport } from "../../../../../services/imports/undo.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  ImportParam,
  ImportSchema,
} from "../../../../schemas/import-history.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/imports/{importId}/restore",
  operationId: "restoreImport",
  tags: ["Imports"],
  summary: "Put back an undone import",
  description:
    "Puts back the recipes Undo moved to Recently deleted, those still there. One deleted for good since is gone.",
  ...openToKeys("recipes", "write"),
  request: { params: ImportParam },
  responses: {
    200: jsonResponse(ImportSchema, "Put back."),
    404: errorResponse("No such import in this household."),
    409: errorResponse("It hasn't been undone."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const { importId } = c.req.valid("param")
    await restoreImport(em, await findImport(em, importId))
    // Changed elsewhere since it was read: read it again.
    em.clear()
    return c.json(importSummary(await findImport(em, importId)), 200)
  })
}
