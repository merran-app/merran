import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { INVITE_ROLES } from "../../../../../../database/entities/index.ts"
import { queueInvitation } from "../../../../../../modules/email/invitations.ts"
import { asHouseholdAdmin } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  describeInviteLink,
  InviteLinkSchema,
} from "../../../../../schemas/households.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/households/current/invites/email",
  operationId: "emailInvite",
  tags: ["Households"],
  summary: "Email a household invitation",
  description:
    "Household admins only. Queues a single-use, seven-day invitation bound to the recipient address. Requires configured SMTP and MERRAN_PUBLIC_URL. Limited to 20 email invitations or resends per household per hour. No link or token is returned.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              email: z.email().max(254),
              role: z.enum(INVITE_ROLES).default("member"),
            })
            .openapi({
              example: { email: "jamie@example.com", role: "member" },
            }),
        },
      },
    },
  },
  responses: {
    201: jsonResponse(InviteLinkSchema, "Queued for delivery."),
    400: errorResponse("Email or the public URL is not configured."),
    409: errorResponse("Already a member, or an invitation is pending."),
    429: errorResponse(
      "This household has reached its hourly invitation limit."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = asHouseholdAdmin(c)
    const invite = await queueInvitation(em, deps, {
      householdId,
      createdBy: userId,
      ...c.req.valid("json"),
    })
    return c.json(describeInviteLink(invite), 201)
  })
}
