import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { describeJob } from "../../../../../services/jobs/jobs.ts"
import { checkPricesNow } from "../../../../../services/stores/prices.ts"
import { asHouseholdAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import { JobSchema } from "../../../../schemas/jobs.ts"
import { PriceCheckSchema } from "../../../../schemas/stores.ts"

const route = createRoute({
  method: "post",
  path: "/stores/kroger/prices",
  operationId: "checkKrogerPrices",
  tags: ["Stores"],
  summary: "Check prices now",
  description:
    "Household admins only. What's done each morning by itself: today's prices for the products the household keeps, and a look at the store for foods its recipes use, for their sales. It waits up to 10 seconds; past that it answers 202 with the job, and the check goes on in the background.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(PriceCheckSchema, "Checked."),
    202: jsonResponse(
      JobSchema,
      "Still checking: the stores say it's checking until this job is done."
    ),
    409: errorResponse(
      "The check was stopped before it finished (`job_stopped`)."
    ),
    422: errorResponse("Kroger isn't set up, or there's no store picked."),
    429: errorResponse("Kroger's daily limit for the app is used up."),
    502: errorResponse(
      "Kroger didn't answer, or the check didn't finish (`job_failed`)."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = asHouseholdAdmin(c)
    const answer = await checkPricesNow(deps, em, { householdId, userId })
    if ("started" in answer) return c.json(describeJob(answer.started), 202)
    return c.json(answer.done, 200)
  })
}
