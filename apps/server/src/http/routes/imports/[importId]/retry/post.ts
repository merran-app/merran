import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import {
  findImport,
  importSummary,
} from "../../../../../services/imports/describe.ts"
import {
  retryImport,
  retryKind,
} from "../../../../../services/imports/retry.ts"
import {
  asHouseholdAdmin,
  inHousehold,
  openToKeys,
  serverAdmin,
} from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  ImportParam,
  ImportSchema,
  RetryImportRequestSchema,
} from "../../../../schemas/import-history.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/imports/{importId}/retry",
  operationId: "retryImport",
  tags: ["Imports"],
  summary: "Try an import again",
  description:
    "Starts a new import of just what didn't come in: the links that failed or were never reached, or another app's recipes that failed. A file import needs its file still kept (a week) and a household admin; Mealie through its API needs its token again and the server admin; a Merran export starts again, skipping what's in.",
  ...openToKeys("imports", "write"),
  request: {
    params: ImportParam,
    body: {
      required: false,
      content: { "application/json": { schema: RetryImportRequestSchema } },
    },
  },
  responses: {
    202: jsonResponse(ImportSchema, "The new import, started."),
    404: errorResponse("No such import in this household."),
    409: errorResponse(
      "Nothing to try again, or the file it needs isn't kept any more."
    ),
    422: errorResponse("Mealie's token is needed."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { settings }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const record = await findImport(em, c.req.valid("param").importId)
    // Whoever could start it: a file or an export for household admins,
    // Mealie through its API for the server admin too.
    const kind = retryKind(record)
    if (kind === "mealie") serverAdmin(c)
    if (kind !== "links") asHouseholdAdmin(c)
    const body = c.req.valid("json") ?? {}
    const id = await retryImport(em, { settings }, record, {
      householdId,
      userId,
      token: body.token ?? null,
    })
    return c.json(importSummary(await findImport(em, id)), 202)
  })
}
