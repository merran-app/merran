import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { listShares } from "../../../../../services/recipes/sharing/shares.ts"
import { asHouseholdAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { HouseholdSharesSchema } from "../../../../schemas/sharing.ts"

const route = createRoute({
  method: "get",
  path: "/households/current/shares",
  operationId: "listHouseholdShares",
  tags: ["Households"],
  summary: "See every recipe the household shares by link",
  description:
    "Newest first, with who shared each and when its link was last opened. Household admins only.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(HouseholdSharesSchema, "What it shares."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { config }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = asHouseholdAdmin(c)
    // Links are built from the public URL, so without one there's none to list.
    if (!config.publicUrl) return c.json({ shares: [] }, 200)
    return c.json({ shares: await listShares(em, config.publicUrl) }, 200)
  })
}
