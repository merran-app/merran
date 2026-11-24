import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import {
  describeJob,
  listHouseholdJobs,
} from "../../../../../services/jobs/jobs.ts"
import { asHouseholdAdmin } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  HouseholdJobListSchema,
  JobListQuerySchema,
} from "../../../../schemas/jobs.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/households/current/jobs",
  operationId: "listHouseholdJobs",
  tags: ["Households"],
  summary: "The household's jobs",
  description:
    "Household admins only. The household's jobs, newest first, up to 100: imports, library runs, Discover searches and the rest, with how each is going.",
  security: SESSION_SECURITY,
  request: { query: JobListQuerySchema },
  responses: {
    200: jsonResponse(HouseholdJobListSchema, "The jobs."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId } = asHouseholdAdmin(c)
    const { status } = c.req.valid("query")
    const jobs = await listHouseholdJobs(c.var.em, householdId, { status })
    return c.json({ jobs: jobs.map(describeJob) }, 200)
  })
}
