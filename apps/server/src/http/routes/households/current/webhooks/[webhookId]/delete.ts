import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import {
  deleteWebhook,
  findWebhook,
  requireWebhooks,
} from "../../../../../../services/webhooks/webhooks.ts"
import { asHouseholdAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  errorResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"
import { WebhookParam } from "../../../../../schemas/webhooks.ts"

const route = createRoute({
  method: "delete",
  path: "/households/current/webhooks/{webhookId}",
  operationId: "deleteWebhook",
  tags: ["Webhooks"],
  summary: "Delete a webhook",
  description:
    "Household admins only. It stops at once, and its deliveries log goes with it.",
  security: SESSION_SECURITY,
  request: { params: WebhookParam },
  responses: {
    204: { description: "Deleted." },
    404: errorResponse("No such webhook in this household."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    requireWebhooks()
    const { em } = asHouseholdAdmin(c)
    const webhook = await findWebhook(em, c.req.valid("param").webhookId)
    await deleteWebhook(em, webhook)
    return c.body(null, 204)
  })
}
