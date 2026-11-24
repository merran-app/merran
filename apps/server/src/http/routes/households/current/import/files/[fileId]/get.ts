import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import { describeFileCheck } from "../../../../../../../services/recipes/import/apps/check-job.ts"
import { asHouseholdAdmin } from "../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../router.ts"
import {
  ImportFileCheckSchema,
  ImportFileParam,
} from "../../../../../../schemas/imports.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/households/current/import/files/{fileId}",
  operationId: "getImportFile",
  tags: ["Households"],
  summary: "How a file's check is going",
  description:
    "Household admins only. Checking while Merran reads it, then what's in it, or why it can't be imported.",
  security: SESSION_SECURITY,
  request: { params: ImportFileParam },
  responses: {
    200: jsonResponse(ImportFileCheckSchema, "The check."),
    404: errorResponse("The file isn't here any more."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = asHouseholdAdmin(c)
    return c.json(
      await describeFileCheck(em, c.req.valid("param").fileId, householdId),
      200
    )
  })
}
