import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { telemetryStatus } from "../../../../modules/telemetry/question.ts"
import { TELEMETRY } from "../../../../modules/telemetry/settings.ts"
import { serverAdmin } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"
import { TelemetryStatusSchema } from "../../../schemas/settings.ts"

const route = createRoute({
  method: "post",
  path: "/telemetry/answer",
  operationId: "answerTelemetryQuestion",
  tags: ["Settings"],
  summary: "Answer whether to send the daily summary",
  description:
    "Server admins only. The answer to the question asked once after setup: turns telemetry on or off, and it isn't asked again. Settings can change it any time.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              send: z.boolean().openapi({
                description:
                  "Send the Merran project an anonymous summary once a day.",
              }),
            })
            .openapi("TelemetryAnswer", { example: { send: true } }),
        },
      },
    },
  },
  responses: {
    200: jsonResponse(TelemetryStatusSchema, "How it's going now."),
    400: errorResponse("Something's wrong with what was sent."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { settings }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { user } = serverAdmin(c)
    const { send } = c.req.valid("json")
    // Asked once: a second answer, from another tab say, changes nothing.
    if (await settings.server(TELEMETRY.asked)) {
      return c.json(await telemetryStatus(settings), 200)
    }
    const state = (await settings.describeServer()).find(
      (setting) => setting.key === TELEMETRY.enabled.key
    )
    // The environment's choice stands; the question's just answered.
    if (state?.lockedBy === null) {
      await settings.saveServer(
        c.var.em,
        { [TELEMETRY.enabled.key]: send },
        user.id
      )
    }
    await settings.keepServer(c.var.em, TELEMETRY.asked, true)
    return c.json(await telemetryStatus(settings), 200)
  })
}
