import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../../core/context.ts"
import { AppError } from "../../../../../../../core/errors.ts"
import { shoppingSwapTargets } from "../../../../../../../services/list/substitutions/substitutions.ts"
import { suggestSwaps } from "../../../../../../../services/recipes/swaps.ts"
import { inHousehold } from "../../../../../../middleware/auth.ts"
import type { Router } from "../../../../../../router.ts"
import { ItemParam } from "../../../../../../schemas/list.ts"
import { IDS } from "../../../../../../schemas/examples.ts"
import { SwapsSchema } from "../../../../../../schemas/swaps.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../../schemas/responses.ts"
const Input = z
  .object({
    mealId: z.string(),
    recipeId: z.string(),
    ingredientId: z.string(),
    state: z.string(),
  })
  .openapi("ShoppingSwapSuggestionInput", {
    example: {
      mealId: IDS.planEntry,
      recipeId: IDS.lemonChicken,
      ingredientId: IDS.ingredients[0],
      state: "example-state",
    },
  })
const route = createRoute({
  method: "post",
  path: "/list/items/{itemId}/substitutions/suggest",
  operationId: "suggestShoppingSwaps",
  tags: ["List"],
  summary: "Find substitutions that work in a planned meal",
  description:
    "Signed-in household members only. Uses the household's AI swaps task, dietary rules and pantry with the actual saved meal ingredients and instructions. Nothing is applied automatically.",
  request: {
    params: ItemParam,
    body: {
      required: true,
      content: { "application/json": { schema: Input } },
    },
  },
  responses: {
    200: jsonResponse(SwapsSchema, "Possible replacements."),
    404: errorResponse("Context no longer available."),
    409: errorResponse("Meal changed."),
    ...SIGNED_IN_ERRORS,
  },
})
export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const input = c.req.valid("json")
    const { targets } = await shoppingSwapTargets(
      em,
      c.req.valid("param").itemId
    )
    const target = targets.find(
      (target) =>
        target.mealId === input.mealId &&
        target.recipe.recipeId === input.recipeId &&
        target.ingredientId === input.ingredientId &&
        target.state === input.state
    )
    if (!target)
      throw new AppError(
        "conflict",
        "shopping_changed",
        "The meal changed. Review substitutions again."
      )
    return c.json(
      {
        swaps: await suggestSwaps(deps, em, {
          householdId,
          userId,
          recipe: input.recipeId,
          ingredientId: input.ingredientId,
          context: target.recipe,
        }),
      },
      200
    )
  })
}
