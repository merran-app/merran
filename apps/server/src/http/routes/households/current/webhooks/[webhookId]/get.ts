import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { describeWebhook } from "../../../../../../services/webhooks/views.ts"
import {
  findWebhook,
  requireWebhooks,
  webhookAddress,
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
  WebhookDetailSchema,
  WebhookParam,
} from "../../../../../schemas/webhooks.ts"

const route = createRoute({
  method: "get",
  path: "/households/current/webhooks/{webhookId}",
  operationId: "getWebhook",
  tags: ["Webhooks"],
  summary: "One webhook, with its address",
  description:
    "Household admins only. The whole address, for editing it; the secret is shown on its own.",
  security: SESSION_SECURITY,
  request: { params: WebhookParam },
  responses: {
    200: jsonResponse(WebhookDetailSchema, "The webhook."),
    404: errorResponse("No such webhook in this household."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    requireWebhooks()
    const { em } = asHouseholdAdmin(c)
    const webhook = await findWebhook(em, c.req.valid("param").webhookId)
    return c.json(
      {
        ...describeWebhook(webhook),
        address: webhookAddress(deps, webhook),
      },
      200
    )
  })
}
