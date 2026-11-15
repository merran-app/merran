import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import { describeLinkImport } from "../../../../../../../services/recipes/import/import-links.ts"
import { AppError } from "../../../../../../../core/errors.ts"
import { findJob } from "../../../../../../../services/jobs/jobs.ts"
import { inHousehold, openToKeys } from "../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../router.ts"
import {
  LinkImportParam,
  LinkImportSchema,
} from "../../../../../../schemas/imports.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/import/links/{importId}/stop",
  operationId: "stopLinkImport",
  tags: ["Recipes"],
  summary: "Stop a link import",
  description:
    "The recipes it added stay. The link it's on is cut off and shows as stopped; it takes a moment, so the answer may still say it's running.",
  ...openToKeys("imports", "write"),
  request: { params: LinkImportParam },
  responses: {
    200: jsonResponse(LinkImportSchema, "Stopped, or stopping."),
    404: errorResponse("No such import in this household."),
    409: errorResponse("It has already finished."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { jobs }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { importId } = c.req.valid("param")
    const job = await findJob(em, importId, householdId)
    if (job.kind !== "recipes.importLinks") {
      throw new AppError(
        "not_found",
        "import_not_found",
        "There's no such import."
      )
    }
    await jobs.cancel(em, job)
    return c.json(await describeLinkImport(em, importId), 200)
  })
}
