import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import {
  requestPasswordReset,
  resetRateLimit,
} from "../../../../../modules/email/password-resets.ts"
import { CLIENT_ADDRESS_HEADER } from "../../../../../services/auth/auth.ts"
import type { Router } from "../../../../router.ts"
import { errorResponse, jsonResponse } from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/auth/password-reset/request",
  operationId: "requestPasswordReset",
  tags: ["Sign-in"],
  summary: "Request a password-reset email",
  description:
    "Public. Always returns the same success for existing and unknown addresses, disabled SMTP and suppressed per-address requests. Queues mail without signing in or looking up the account. Five requests per client address and three emails per recipient per 15-minute window. Tokens last 30 minutes; no token is returned.",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              email: z.string().trim().max(254).toLowerCase().pipe(z.email()),
            })
            .openapi({ example: { email: "sam@example.com" } }),
        },
      },
    },
  },
  responses: {
    200: jsonResponse(
      z
        .object({ requested: z.literal(true) })
        .openapi({ example: { requested: true } }),
      "If email recovery is available for that account, a link will be sent."
    ),
    429: errorResponse("Too many recovery requests from this client address."),
  },
})
export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    if (
      !(await resetRateLimit(
        c.var.em,
        "request-ip",
        c.req.header(CLIENT_ADDRESS_HEADER) ?? "unknown",
        5
      ))
    ) {
      c.header("Retry-After", "900")
      throw new AppError(
        "rate_limited",
        "reset_request_limit",
        "Too many reset requests. Try again in 15 minutes."
      )
    }
    await requestPasswordReset(c.var.em, deps, c.req.valid("json").email)
    c.header("Cache-Control", "no-store")
    return c.json({ requested: true as const }, 200)
  })
}
