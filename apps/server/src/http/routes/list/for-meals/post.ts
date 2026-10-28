import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { putShortOnList } from "../../../../services/list/covered.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { ForMealsResultSchema, ForMealsSchema } from "../../../schemas/list.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/list/for-meals",
  operationId: "putShortOnList",
  tags: ["List"],
  summary: "Put what planned meals are short of on the list",
  description:
    "For planned meals on the list that are still to come: everything set aside for them in things used up, and what things at home don't have enough of any more, which stops being set aside. Each goes on the list as those meals' share, so the list follows the plan for it. The answer says what the list and the pantry were, for Undo with /list/restore and /pantry/restore.",
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ForMealsSchema } },
    },
  },
  responses: {
    200: jsonResponse(ForMealsResultSchema, "On the list."),
    400: errorResponse("Nothing to put on the list."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(
      await putShortOnList(em, householdId, c.req.valid("json")),
      200
    )
  })
}
