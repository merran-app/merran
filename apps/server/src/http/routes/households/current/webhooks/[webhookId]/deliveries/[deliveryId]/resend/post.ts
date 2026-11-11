import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../../../core/context.ts"
import { describeDelivery } from "../../../../../../../../../services/webhooks/views.ts"
import {
  findDelivery,
  findWebhook,
  requireWebhooks,
  resendDelivery,
} from "../../../../../../../../../services/webhooks/webhooks.ts"
import { asHouseholdAdmin } from "../../../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../../../../schemas/responses.ts"
import {
  DeliveryParam,
  DeliverySchema,
} from "../../../../../../../../schemas/webhooks.ts"

const route = createRoute({
  method: "post",
  path: "/households/current/webhooks/{webhookId}/deliveries/{deliveryId}/resend",
  operationId: "resendWebhookDelivery",
  tags: ["Webhooks"],
  summary: "Resend a delivery",
  description:
    "Household admins only. Sends it again from its first try, on the usual schedule, with the same `webhook-id`. Not while it's still being tried (`delivery_waiting`), or while its webhook is paused (`webhook_paused`).",
  security: SESSION_SECURITY,
  request: { params: DeliveryParam },
  responses: {
    200: jsonResponse(DeliverySchema, "Waiting to be sent again."),
    404: errorResponse("No such webhook or delivery in this household."),
    409: errorResponse("It's still being tried, or its webhook is paused."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    requireWebhooks()
    const { em } = asHouseholdAdmin(c)
    const { webhookId, deliveryId } = c.req.valid("param")
    const webhook = await findWebhook(em, webhookId)
    const delivery = await findDelivery(em, webhook, deliveryId)
    await resendDelivery(em, delivery)
    return c.json(describeDelivery(delivery), 200)
  })
}
