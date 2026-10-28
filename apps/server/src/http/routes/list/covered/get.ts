import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { coveredAtHome } from "../../../../services/list/covered.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { CoveredSchema } from "../../../schemas/list.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/list/covered",
  operationId: "getCovered",
  tags: ["List"],
  summary: "What's at home instead of on the list",
  description:
    "What the list counted on at home for planned meals on it that are still to come, so left off: each thing, how much, which meals, and what those meals still need of it on the list when it covers only part. Also what's always on hand that those meals use, left off by the household's setting.",
  ...openToKeys("list", "read"),
  responses: {
    200: jsonResponse(CoveredSchema, "Covered at home."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(await coveredAtHome(em, householdId), 200)
  })
}
