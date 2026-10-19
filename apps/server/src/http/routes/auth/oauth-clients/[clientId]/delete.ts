import { createRoute, z } from "@hono/zod-openapi"
import type { Router } from "../../../../router.ts"
import type { AppDeps } from "../../../../../core/context.ts"
import { OauthClient } from "../../../../../database/entities/index.ts"
import { serverAdmin } from "../../../../middleware/auth.ts"
import {
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/auth/oauth-clients/{clientId}",
  operationId: "deleteOAuthClient",
  tags: ["Sign-in"],
  summary: "Remove an application",
  description:
    "Server administrators can remove a client and all its grants and tokens.",
  security: SESSION_SECURITY,
  request: { params: z.object({ clientId: z.string() }) },
  responses: {
    204: { description: "Application removed." },
    ...SIGNED_IN_ERRORS,
  },
})
export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    await c.var.em.nativeDelete(OauthClient, {
      clientId: c.req.valid("param").clientId,
    })
    return c.body(null, 204)
  })
}
