import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { addRecipeToList } from "../../../../services/list/recipe.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  RecipeListedSchema,
  RecipeToListSchema,
} from "../../../schemas/list.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/list/recipes",
  operationId: "addRecipeToList",
  tags: ["List"],
  summary: "Add a recipe to the list",
  description:
    "A recipe's ingredients on the list without planning a day for it, as Add from plan would put them, the list following that meal from then on. A meal of the recipe planned already from today to the end of the week, and not on the list yet, goes on, with the servings given. Otherwise a new one goes in the week's any-day meals. The week is the one with tomorrow in it, so on its last day it's next week. Every-week items don't come along. Give `undo` to /list/recipes/undo to take it back.",
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: RecipeToListSchema } },
    },
  },
  responses: {
    201: jsonResponse(RecipeListedSchema, "On the list."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    return c.json(
      await addRecipeToList(em, householdId, c.req.valid("json")),
      201
    )
  })
}
