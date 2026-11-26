import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { undoRecipeOnList } from "../../../../../services/list/recipe.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { RecipeOnListUndoSchema } from "../../../../schemas/list.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/list/recipes/undo",
  operationId: "undoRecipeOnList",
  tags: ["List"],
  summary: "Undo adding a recipe to the list",
  description:
    "Takes `undo` from adding a recipe to the list. A meal it made comes off the plan, and so off the list. One that was planned already stays on the plan, off the list again, with its servings as they were. Needs only list write, like adding.",
  ...openToKeys("list", "write"),
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: RecipeOnListUndoSchema } },
    },
  },
  responses: {
    200: jsonResponse(
      z.object({ done: z.boolean() }).openapi({ example: { done: true } }),
      "Undone."
    ),
    400: errorResponse("That meal wasn't made by adding a recipe to the list."),
    404: errorResponse("That meal isn't on the plan."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    await undoRecipeOnList(em, householdId, c.req.valid("json"))
    return c.json({ done: true }, 200)
  })
}
