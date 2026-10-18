import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { AppError } from "../../../../../core/errors.ts"
import {
  completePasswordReset,
  resetRateLimit,
} from "../../../../../modules/email/password-resets.ts"
import { CLIENT_ADDRESS_HEADER } from "../../../../../services/auth/auth.ts"
import type { Router } from "../../../../router.ts"
import { errorResponse, jsonResponse } from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/auth/password-reset/complete",
  operationId: "completePasswordReset",
  tags: ["Sign-in"],
  summary: "Set a new password with a reset token",
  description:
    "Public. Accepts a single-use token from the reset email and a 10–128 character password. Revokes every session and invalidates all older reset links for the account. Does not sign in or verify the account email. Ten attempts per client address per 15-minute window. Tokens go in the body, never the request URL.",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              token: z.string().regex(/^[a-zA-Z0-9_-]{43}$/),
              password: z.string().min(10).max(128),
            })
            .openapi({
              example: {
                token: "a".repeat(43),
                password: "correct horse battery staple",
              },
            }),
        },
      },
    },
  },
  responses: {
    200: jsonResponse(
      z
        .object({ reset: z.literal(true) })
        .openapi({ example: { reset: true } }),
      "Password changed. Sign in with the new password."
    ),
    400: errorResponse(
      "Invalid, expired, used or superseded token, or invalid password."
    ),
    429: errorResponse("Too many reset attempts from this client address."),
  },
})
export default (router: Router, { auth }: AppDeps) => {
  router.openapi(route, async (c) => {
    if (
      !(await resetRateLimit(
        c.var.em,
        "complete-ip",
        c.req.header(CLIENT_ADDRESS_HEADER) ?? "unknown",
        10
      ))
    ) {
      c.header("Retry-After", "900")
      throw new AppError(
        "rate_limited",
        "reset_attempt_limit",
        "Too many reset attempts. Try again in 15 minutes."
      )
    }
    const { token, password } = c.req.valid("json")
    await completePasswordReset(c.var.em, auth, token, password)
    c.header("Cache-Control", "no-store")
    return c.json({ reset: true as const }, 200)
  })
}
