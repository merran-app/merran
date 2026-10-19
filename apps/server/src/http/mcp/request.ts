import { createMcpHandler } from "@modelcontextprotocol/server"
import type { AppDeps } from "../../core/context.ts"
import { createMerranMcp } from "../../services/mcp/server.ts"
import type { Context } from "hono"
import type { AppEnv } from "../../core/context.ts"
import {
  delegatedCredential,
  requireAudience,
} from "../../services/auth/credentials.ts"

/** Per-request transport; authentication and rate limits run in the app middleware. */
export function mcpRequest(deps: AppDeps) {
  return async (c: Context<AppEnv>) => {
    c.header("Cache-Control", "no-store")
    const { household, user } = c.var
    const credential = delegatedCredential(c.var.credential)
    if (!credential || !household || !user) {
      c.header("WWW-Authenticate", 'Bearer realm="Merran MCP"')
      return c.json(
        {
          error: {
            code: "api_key_required",
            message:
              deps.config.fromEnv.get("auth.oauth") === true
                ? "Connect with OAuth or a Merran API key."
                : "Connect with a Merran API key.",
          },
        },
        401
      )
    }
    requireAudience(credential, "mcp")
    // Native MCP clients omit Origin. Browser clients must use the configured
    // public origin; never trust a request's Host as its own allowlist.
    const origin = c.req.header("Origin")
    if (
      origin &&
      (!deps.config.publicUrl ||
        origin !== new URL(deps.config.publicUrl).origin)
    ) {
      return c.json(
        {
          error: {
            code: "invalid_origin",
            message: "That origin cannot use MCP.",
          },
        },
        403
      )
    }
    const handler = createMcpHandler(
      () =>
        createMerranMcp(deps, c.var.em, {
          householdId: household.id,
          userId: user.id,
          keyName: credential.name,
          permissions: credential.permissions,
        }),
      { maxRequestBodySize: 1024 * 1024, maxSubscriptions: 0 }
    )
    // No subscriptions or sessions: each request rechecks key validity and scopes.
    try {
      return await handler.fetch(c.req.raw)
    } finally {
      await handler.close()
    }
  }
}
