import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { telemetryStatus } from "../../../../modules/telemetry/question.ts"
import { serverAdmin } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"
import { TelemetryStatusSchema } from "../../../schemas/settings.ts"

const route = createRoute({
  method: "get",
  path: "/telemetry/status",
  operationId: "getTelemetryStatus",
  tags: ["Settings"],
  summary: "How telemetry is going",
  description:
    "Server admins only. Whether the Merran project is taking summaries yet, whether to ask the admin about sending one, and how the last one went.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(TelemetryStatusSchema, "How it's going."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { settings }: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    return c.json(await telemetryStatus(settings), 200)
  })
}
