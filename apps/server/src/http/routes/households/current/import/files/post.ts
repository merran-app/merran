import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import {
  describeFileCheck,
  startFileCheck,
} from "../../../../../../services/recipes/import/apps/check-job.ts"
import { saveUpload } from "../../../../../../services/transfer/read-export.ts"
import { asHouseholdAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { ImportFileCheckSchema } from "../../../../../schemas/imports.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const binary = { schema: z.string().openapi({ format: "binary" }) }

/** How long the request waits for a small file's check. */
const CHECK_WAIT_MS = 2_000

const route = createRoute({
  method: "post",
  path: "/households/current/import/files",
  operationId: "checkImportFile",
  tags: ["Households"],
  summary: "Check a file from another app",
  description:
    "Household admins only. The body is the file: a Mealie backup, recipes exported from Mealie, or a Paprika export. It's kept, and read in the background: follow its check at /households/current/import/files/{fileId} until it says what's in it, then start its import at /households/current/import/files/{fileId}/start. A small file is often checked by the time this answers. A file not started is cleared away after a week.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: {
        "application/zip": binary,
        "application/octet-stream": binary,
      },
    },
  },
  responses: {
    202: jsonResponse(ImportFileCheckSchema, "Kept, and being checked."),
    413: errorResponse("The file is too big."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { config, jobs }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = asHouseholdAdmin(c)
    const { id, path } = await saveUpload(config.dataDir, c.req.raw.body, {
      owner: householdId,
    })
    const job = await startFileCheck(em, {
      householdId,
      userId,
      fileId: id,
      file: path,
    })
    // Adding it woke the runner already, except where nothing listens.
    jobs.wake()
    await jobs.waitFor(job.id, CHECK_WAIT_MS)
    return c.json(await describeFileCheck(em, id, householdId), 202)
  })
}
