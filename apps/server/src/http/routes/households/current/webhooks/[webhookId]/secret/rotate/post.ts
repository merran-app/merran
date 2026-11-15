import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../../core/context.ts"
import {
  findWebhook,
  requireWebhooks,
  rotateWebhookSecret,
} from "../../../../../../../../services/webhooks/webhooks.ts"
import { asHouseholdAdmin } from "../../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../../../schemas/responses.ts"
import {
  WebhookParam,
  WebhookSecretSchema,
} from "../../../../../../../schemas/webhooks.ts"

const route = createRoute({
  method: "post",
  path: "/households/current/webhooks/{webhookId}/secret/rotate",
  operationId: "rotateWebhookSecret",
  tags: ["Webhooks"],
  summary: "Rotate a webhook's secret",
  description:
    "Household admins only. Makes a new secret. For 24 hours each delivery is signed with the old one too, so a receiver can change over without missing one.",
  security: SESSION_SECURITY,
  request: { params: WebhookParam },
  responses: {
    200: jsonResponse(WebhookSecretSchema, "The new secret."),
    404: errorResponse("No such webhook in this household."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    requireWebhooks()
    const { em } = asHouseholdAdmin(c)
    const webhook = await findWebhook(em, c.req.valid("param").webhookId)
    const secret = await rotateWebhookSecret(em, deps, webhook)
    return c.json({ secret }, 200)
  })
}
