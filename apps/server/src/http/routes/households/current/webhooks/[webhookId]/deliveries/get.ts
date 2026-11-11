import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import { describeDelivery } from "../../../../../../../services/webhooks/views.ts"
import {
  findWebhook,
  listDeliveries,
  requireWebhooks,
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
  DeliveryListQuerySchema,
  DeliveryListSchema,
  WebhookParam,
} from "../../../../../../schemas/webhooks.ts"

const route = createRoute({
  method: "get",
  path: "/households/current/webhooks/{webhookId}/deliveries",
  operationId: "listWebhookDeliveries",
  tags: ["Webhooks"],
  summary: "A webhook's deliveries log",
  description:
    "Household admins only. What was sent in the last 30 days, newest first: the event, how many tries, the last answer and the exact body sent.",
  security: SESSION_SECURITY,
  request: { params: WebhookParam, query: DeliveryListQuerySchema },
  responses: {
    200: jsonResponse(DeliveryListSchema, "A page of deliveries."),
    404: errorResponse("No such webhook in this household."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    requireWebhooks()
    const { em } = asHouseholdAdmin(c)
    const webhook = await findWebhook(em, c.req.valid("param").webhookId)
    const { deliveries, total } = await listDeliveries(
      em,
      webhook.id,
      c.req.valid("query")
    )
    return c.json({ deliveries: deliveries.map(describeDelivery), total }, 200)
  })
}
