import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { describeWebhook } from "../../../../../../services/webhooks/views.ts"
import {
  findWebhook,
  requireWebhooks,
  updateWebhook,
} from "../../../../../../services/webhooks/webhooks.ts"
import { asHouseholdAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"
import {
  WebhookChangesSchema,
  WebhookParam,
  WebhookSchema,
} from "../../../../../schemas/webhooks.ts"

const route = createRoute({
  method: "patch",
  path: "/households/current/webhooks/{webhookId}",
  operationId: "updateWebhook",
  tags: ["Webhooks"],
  summary: "Change, pause or resume a webhook",
  description:
    "Household admins only. Only what's sent changes. A new address is checked as when adding one. Resuming can resend what didn't arrive in the last day.",
  security: SESSION_SECURITY,
  request: {
    params: WebhookParam,
    body: {
      required: true,
      content: { "application/json": { schema: WebhookChangesSchema } },
    },
  },
  responses: {
    200: jsonResponse(WebhookSchema, "Changed."),
    400: errorResponse(
      "The address, the events or a header can't be used, with a message for each field."
    ),
    404: errorResponse("No such webhook in this household."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    requireWebhooks()
    const { em, householdId } = asHouseholdAdmin(c)
    const webhook = await findWebhook(em, c.req.valid("param").webhookId)
    const changed = await updateWebhook(em, deps, {
      householdId,
      webhook,
      changes: c.req.valid("json"),
    })
    return c.json(describeWebhook(changed), 200)
  })
}
