import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import { resendInvitation } from "../../../../../../../modules/email/invitations.ts"
import { asHouseholdAdmin } from "../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../router.ts"
import {
  describeInviteLink,
  InviteLinkSchema,
  InviteParam,
} from "../../../../../../schemas/households.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/households/current/invites/{inviteId}/resend",
  operationId: "resendInvite",
  tags: ["Households"],
  summary: "Resend an email invitation",
  description:
    "Household admins only. Queues the same link without extending its seven-day expiry. Wait at least one minute between sends; invitations already queued or sending cannot be resent. Counts toward the household's 20-per-hour limit.",
  security: SESSION_SECURITY,
  request: { params: InviteParam },
  responses: {
    200: jsonResponse(InviteLinkSchema, "Queued for delivery."),
    400: errorResponse("Email or the public URL is not configured."),
    404: errorResponse("No pending email invitation."),
    409: errorResponse("Already queued or sending."),
    429: errorResponse(
      "Wait before resending, or the hourly limit was reached."
    ),
    ...SIGNED_IN_ERRORS,
  },
})
export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = asHouseholdAdmin(c)
    const invite = await resendInvitation(em, deps, {
      householdId,
      createdBy: userId,
      inviteId: c.req.valid("param").inviteId,
    })
    return c.json(describeInviteLink(invite), 200)
  })
}
