import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import {
  findWebhook,
  requireWebhooks,
  webhookSecret,
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
  WebhookParam,
  WebhookSecretSchema,
} from "../../../../../../schemas/webhooks.ts"

const route = createRoute({
  method: "get",
  path: "/households/current/webhooks/{webhookId}/secret",
  operationId: "getWebhookSecret",
  tags: ["Webhooks"],
  summary: "Show a webhook's secret",
  description:
    "Household admins only. The secret its deliveries are signed with now, in the Standard Webhooks form (`whsec_…`).",
  security: SESSION_SECURITY,
  request: { params: WebhookParam },
  responses: {
    200: jsonResponse(WebhookSecretSchema, "The secret."),
    404: errorResponse("No such webhook in this household."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    requireWebhooks()
    const { em } = asHouseholdAdmin(c)
    const webhook = await findWebhook(em, c.req.valid("param").webhookId)
    return c.json({ secret: webhookSecret(deps, webhook) }, 200)
  })
}
