import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { describeWebhook } from "../../../../../services/webhooks/views.ts"
import {
  listWebhooks,
  requireWebhooks,
} from "../../../../../services/webhooks/webhooks.ts"
import { asHouseholdAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { WebhookSchema } from "../../../../schemas/webhooks.ts"

const route = createRoute({
  method: "get",
  path: "/households/current/webhooks",
  operationId: "listWebhooks",
  tags: ["Webhooks"],
  summary: "The household's webhooks",
  description:
    "Household admins only. Each with the host it sends to, but not the whole address or its secret.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(z.array(WebhookSchema), "In the order they were added."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    requireWebhooks()
    const { em } = asHouseholdAdmin(c)
    const webhooks = await listWebhooks(em)
    return c.json(webhooks.map(describeWebhook), 200)
  })
}
