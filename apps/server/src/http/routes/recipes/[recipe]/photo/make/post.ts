import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { describeJob } from "../../../../../../services/jobs/jobs.ts"
import { makePhotoNow } from "../../../../../../services/recipes/photos/runs.ts"
import { inHousehold, openToKeys } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { JobSchema } from "../../../../../schemas/jobs.ts"
import { RecipeParam, RecipeSchema } from "../../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/{recipe}/photo/make",
  operationId: "makeRecipePhoto",
  tags: ["Recipes"],
  summary: "Make a photo with AI",
  description:
    "A photo of the finished dish in the household's style, on its OpenAI or Google key: for a recipe without a photo, or in place of one made by AI before. It waits up to 10 seconds; past that it answers 202 with the job, and the recipe has its photo once the job's done.",
  ...openToKeys("recipes", "write"),
  request: { params: RecipeParam },
  responses: {
    200: jsonResponse(RecipeSchema, "The recipe, with its new photo."),
    202: jsonResponse(
      JobSchema,
      "Still being made: the recipe has its photo once this job is done."
    ),
    404: errorResponse("No such recipe."),
    409: errorResponse("It has a real photo, which an AI one never replaces."),
    422: errorResponse(
      "AI photos are off on the server, or the household has no key for them."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const answer = await makePhotoNow(deps, em, {
      householdId,
      userId,
      recipe: c.req.valid("param").recipe,
    })
    if ("started" in answer) return c.json(describeJob(answer.started), 202)
    return c.json(answer.done, 200)
  })
}
