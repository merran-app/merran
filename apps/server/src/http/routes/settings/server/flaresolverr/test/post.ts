import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { AppError } from "../../../../../../core/errors.ts"
import { FLARESOLVERR } from "../../../../../../modules/flaresolverr/settings.ts"
import { checkFlareSolverr } from "../../../../../../services/fetch/flaresolverr.ts"
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
  path: "/settings/server/flaresolverr/test",
  operationId: "testFlareSolverr",
  tags: ["Settings"],
  summary: "Check FlareSolverr answers",
  description:
    "Server admins only. Asks FlareSolverr, at its saved address, which version it is. Opens no page.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(
      z
        .object({
          version: z.string().nullable().openapi({
            description: "FlareSolverr's version, when it says.",
          }),
        })
        .openapi({ example: { version: "3.3.21" } }),
      "FlareSolverr answered."
    ),
    400: errorResponse("FlareSolverr's address isn't set."),
    502: errorResponse(
      "Nothing answered at the address, or it isn't FlareSolverr."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { settings, fetcher }: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    const address = await settings.server(FLARESOLVERR.url)
    if (!address) {
      throw new AppError(
        "invalid",
        "flaresolverr_off",
        "FlareSolverr's address isn't set."
      )
    }
    return c.json(await checkFlareSolverr(fetcher, address), 200)
  })
}
