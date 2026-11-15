import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { describeWebhook } from "../../../../../services/webhooks/views.ts"
import {
  createWebhook,
  requireWebhooks,
} from "../../../../../services/webhooks/webhooks.ts"
import { asHouseholdAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import {
  NewWebhookSchema,
  WebhookCreatedSchema,
} from "../../../../schemas/webhooks.ts"

const route = createRoute({
  method: "post",
  path: "/households/current/webhooks",
  operationId: "createWebhook",
  tags: ["Webhooks"],
  summary: "Add a webhook",
  description:
    "Household admins only, up to 10 a household. Its signing secret is made now and returned with it. An address on the home network is refused unless the server admin allows it for this household (`webhook_home_network`).",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: NewWebhookSchema } },
    },
  },
  responses: {
    201: jsonResponse(WebhookCreatedSchema, "Added."),
    400: errorResponse(
      "The address, the events or a header can't be used, with a message for each field."
    ),
    409: errorResponse("The household has 10 webhooks already."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    requireWebhooks()
    const { em, householdId, userId } = asHouseholdAdmin(c)
    const { webhook, secret } = await createWebhook(em, deps, {
      householdId,
      userId,
      webhook: c.req.valid("json"),
    })
    return c.json({ webhook: describeWebhook(webhook), secret }, 201)
  })
}
