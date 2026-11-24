import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import {
  findImport,
  importSummary,
} from "../../../../../services/imports/describe.ts"
import { undoImport } from "../../../../../services/imports/undo.ts"
import { findJob } from "../../../../../services/jobs/jobs.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  ImportParam,
  ImportSchema,
  UndoImportRequestSchema,
} from "../../../../schemas/import-history.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

/** How long Undo waits for a running import to stop first. */
const STOP_WAIT_MS = 30_000

const route = createRoute({
  method: "post",
  path: "/imports/{importId}/undo",
  operationId: "undoImport",
  tags: ["Imports"],
  summary: "Undo an import",
  description:
    "Moves the recipes it brought in to Recently deleted, where they stay for 30 days, but any in `keep`. A running import is stopped first. For a Merran export, only its recipes: the household settings it brought stay.",
  ...openToKeys("recipes", "write"),
  request: {
    params: ImportParam,
    body: {
      required: true,
      content: { "application/json": { schema: UndoImportRequestSchema } },
    },
  },
  responses: {
    200: jsonResponse(ImportSchema, "Undone."),
    404: errorResponse("No such import in this household."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { jobs }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { importId } = c.req.valid("param")
    const record = await findImport(em, importId)
    if (record.status === "queued" || record.status === "running") {
      await jobs.cancel(em, await findJob(em, record.id, householdId))
      await jobs.waitFor(record.id, STOP_WAIT_MS)
    }
    await undoImport(em, record, c.req.valid("json").keep)
    // Changed elsewhere since it was read: read it again.
    em.clear()
    return c.json(importSummary(await findImport(em, importId)), 200)
  })
}
