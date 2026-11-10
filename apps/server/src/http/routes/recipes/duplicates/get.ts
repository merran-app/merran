import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { duplicatePairs } from "../../../../services/recipes/duplicates.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { DuplicatePairsSchema } from "../../../schemas/recipes.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/duplicates",
  operationId: "listDuplicatePairs",
  tags: ["Recipes"],
  summary: "Possible duplicate recipes",
  description:
    "Every pair of the household's recipes that may be the same one: the same page under any address, or the same words in their names. A name inside another counts when most of their ingredients agree. Pairs someone said aren't the same, and recipes in Recently deleted, are left out. No AI is used.",
  ...openToKeys("recipes", "read"),
  responses: {
    200: jsonResponse(DuplicatePairsSchema, "The pairs."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json({ pairs: await duplicatePairs(em) }, 200)
  })
}
