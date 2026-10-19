import { createRoute, z } from "@hono/zod-openapi"
import type { Router } from "../../../router.ts"
import type { AppDeps } from "../../../../core/context.ts"
import { OauthClient } from "../../../../database/entities/index.ts"
import { serverAdmin } from "../../../middleware/auth.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/auth/oauth-clients",
  operationId: "listOAuthClients",
  tags: ["Sign-in"],
  summary: "Registered applications",
  description:
    "Server administrators can review registered OAuth clients. Secrets are never returned.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(
      z
        .array(
          z.object({
            clientId: z.string(),
            name: z.string().nullable(),
            redirectUris: z.array(z.string()),
            disabled: z.boolean(),
            createdAt: z.string().nullable(),
          })
        )
        .openapi({ example: [] }),
      "Registered applications."
    ),
    ...SIGNED_IN_ERRORS,
  },
})
export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    const clients = await c.var.em.find(
      OauthClient,
      {},
      { orderBy: { createdAt: "desc" } }
    )
    return c.json(
      clients.map((client) => ({
        clientId: client.clientId,
        name: client.name ?? null,
        redirectUris: client.redirectUris,
        disabled: client.disabled ?? false,
        createdAt: client.createdAt?.toISOString() ?? null,
      })),
      200
    )
  })
}
