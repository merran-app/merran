import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { AppError } from "../../../../core/errors.ts"
import { Import } from "../../../../database/entities/index.ts"
import { findImport } from "../../../../services/imports/describe.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { ImportParam } from "../../../schemas/import-history.ts"
import { errorResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/imports/{importId}",
  operationId: "deleteImport",
  tags: ["Imports"],
  summary: "Delete an import's record",
  description:
    "Only the record goes: the recipes it brought in stay. To delete those, use Undo, or delete them as any other recipe.",
  ...openToKeys("recipes", "write"),
  request: { params: ImportParam },
  responses: {
    204: { description: "Deleted." },
    404: errorResponse("No such import in this household."),
    409: errorResponse("It's still going: stop it first."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    const record = await findImport(em, c.req.valid("param").importId)
    if (record.status === "queued" || record.status === "running") {
      throw new AppError(
        "conflict",
        "import_running",
        "That import is still going. Stop it first."
      )
    }
    await em.nativeDelete(Import, { id: record.id })
    return c.body(null, 204)
  })
}
