import { createRoute } from "@hono/zod-openapi"
import { AppError } from "../../../../../../core/errors.ts"
import type { AppDeps } from "../../../../../../core/context.ts"
import { describeJob, findJob } from "../../../../../../services/jobs/jobs.ts"
import { isAdminRole } from "../../../../../../services/households/households.ts"
import { inHousehold } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import { JobParam, JobSchema } from "../../../../../schemas/jobs.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/households/current/jobs/{jobId}",
  operationId: "getHouseholdJob",
  tags: ["Households"],
  summary: "One of the household's jobs",
  description:
    "Household admins, and whoever started it. How a job for this household, like an import, is getting on. `error`, what broke inside a job that failed, is only for household admins: it's null for anyone else.",
  security: SESSION_SECURITY,
  request: { params: JobParam },
  responses: {
    200: jsonResponse(JobSchema, "The job."),
    404: errorResponse(
      "No such job in this household, or one the person didn't start."
    ),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId, role, userId } = inHousehold(c)
    const job = await findJob(c.var.em, c.req.valid("param").jobId, householdId)
    // A member sees only what they started: anyone else's is as good as
    // not there.
    if (!isAdminRole(role) && job.createdBy?.id !== userId) {
      throw new AppError("not_found", "job_not_found", "There's no such job.")
    }
    // What broke inside a failed job can be SQL or a file path: for the
    // household's admins, not a member who only started it.
    if (!isAdminRole(role)) {
      return c.json({ ...describeJob(job), error: null }, 200)
    }
    return c.json(describeJob(job), 200)
  })
}
