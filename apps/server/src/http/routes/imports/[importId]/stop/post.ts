import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import {
  findImport,
  importSummary,
} from "../../../../../services/imports/describe.ts"
import { findJob } from "../../../../../services/jobs/jobs.ts"
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
  path: "/imports/{importId}/stop",
  operationId: "stopImport",
  tags: ["Imports"],
  summary: "Stop an import",
  description:
    "What it brought in stays. The link or recipe it's on is cut off and shows as stopped; it takes a moment, so the answer may still say it's running.",
  ...openToKeys("imports", "write"),
  request: { params: ImportParam },
  responses: {
    200: jsonResponse(ImportSchema, "Stopped, or stopping."),
    404: errorResponse("No such import in this household."),
    409: errorResponse("It has already finished."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { jobs }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const record = await findImport(em, c.req.valid("param").importId)
    if (record.status !== "queued" && record.status !== "running") {
      throw new AppError(
        "conflict",
        "import_finished",
        "That import has already finished."
      )
    }
    await jobs.cancel(em, await findJob(em, record.id, householdId))
    // A waiting one was cancelled at once, through another view of it.
    await em.refresh(record)
    return c.json(importSummary(record), 200)
  })
}
