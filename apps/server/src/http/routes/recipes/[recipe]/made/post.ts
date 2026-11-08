import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { cookToday } from "../../../../../services/plan/plan.ts"
import {
  findRecipe,
  loadRecipe,
} from "../../../../../services/recipes/recipes.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  MadeRecipeSchema,
  MadeSchema,
  RecipeParam,
} from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/{recipe}/made",
  operationId: "markRecipeMade",
  tags: ["Recipes"],
  summary: "Mark a recipe made",
  description:
    "The recipe was made now, so a meal of it today is cooked: one already cooked today counts, so marking it twice doesn't cook it twice. Failing that, today's planned meal of it is cooked; failing that, one in this week's pool becomes today's, cooked; failing that, one's added to today at the meal that fits the time of day, cooked. Either way it takes from the pantry as any cooked meal does, and its `lastMadeAt` is set. Marking that meal not cooked puts both back. It isn't an edit, so no version is kept.",
  ...openToKeys("recipes", "write"),
  request: {
    params: RecipeParam,
    body: {
      required: false,
      content: { "application/json": { schema: MadeSchema } },
    },
  },
  responses: {
    200: jsonResponse(MadeRecipeSchema, "The recipe, made now."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c)
    const { id } = await findRecipe(em, c.req.valid("param").recipe)
    const { servings } = c.req.valid("json") ?? {}
    const meal = await cookToday(em, householdId, id, servings)
    return c.json({ ...(await loadRecipe(em, id)), meal }, 200)
  })
}
