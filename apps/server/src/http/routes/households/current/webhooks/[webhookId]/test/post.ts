import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import { describeDelivery } from "../../../../../../../services/webhooks/views.ts"
import {
  findWebhook,
  requireWebhooks,
  sendTest,
} from "../../../../../../../services/webhooks/webhooks.ts"
import { asHouseholdAdmin } from "../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../../schemas/responses.ts"
import {
  DeliverySchema,
  WebhookParam,
} from "../../../../../../schemas/webhooks.ts"

const route = createRoute({
  method: "post",
  path: "/households/current/webhooks/{webhookId}/test",
  operationId: "testWebhook",
  tags: ["Webhooks"],
  summary: "Send a test",
  description:
    "Household admins only. Sends a `webhook.test` event to this webhook alone, now, even when it's paused, and answers with what came of it. It's tried once and logged like any delivery, but never retried, and it never pauses the webhook.",
  security: SESSION_SECURITY,
  request: { params: WebhookParam },
  responses: {
    200: jsonResponse(
      DeliverySchema,
      "Tried: delivered or failed, with the answer."
    ),
    404: errorResponse("No such webhook in this household."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    requireWebhooks()
    const { em, householdId } = asHouseholdAdmin(c)
    // Found in this household first, so the test can't go to another's.
    const webhook = await findWebhook(em, c.req.valid("param").webhookId)
    const delivery = await sendTest(em, deps, { householdId, webhook })
    return c.json(describeDelivery(delivery), 200)
  })
}
