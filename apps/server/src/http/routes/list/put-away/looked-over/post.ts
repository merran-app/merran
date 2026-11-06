import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { lookedOver } from "../../../../../services/pantry/put-away/review.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  LookedOverResultSchema,
  LookedOverSchema,
} from "../../../../schemas/pantry.ts"
import {
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/list/put-away/looked-over",
  operationId: "markPutAwayLookedOver",
  tags: ["List"],
  summary: "Say what went in looks right",
  description:
    "Marks these rows' food as looked over, so it isn't shown again. Rows that aren't there, put nothing away, or were looked over already are passed over.",
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: LookedOverSchema } },
    },
  },
  responses: {
    200: jsonResponse(LookedOverResultSchema, "Marked."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { rows } = c.req.valid("json")
    return c.json(await lookedOver(em, householdId, rows), 200)
  })
}
