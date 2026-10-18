import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { sendEmail } from "../../../../../../modules/email/sender.ts"
import { testEmail } from "../../../../../../modules/email/templates.ts"
import { serverAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/settings/server/email/test",
  operationId: "sendTestEmail",
  tags: ["Settings"],
  summary: "Send a test email",
  description:
    "Server admins only. Sends a fixed test message to the signed-in administrator's account email using saved SMTP settings. Acceptance by the provider does not confirm inbox delivery.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(
      z
        .object({ accepted: z.literal(true) })
        .openapi({ example: { accepted: true } }),
      "Accepted by the mail service."
    ),
    400: errorResponse("Email is disabled or incomplete."),
    502: errorResponse("The mail service did not accept the email."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { settings }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { user } = serverAdmin(c)
    await sendEmail(settings, {
      to: user.email,
      ...testEmail(),
    })
    return c.json({ accepted: true as const }, 200)
  })
}
