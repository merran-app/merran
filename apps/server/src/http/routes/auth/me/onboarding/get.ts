import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { onboardingStatus } from "../../../../../services/onboarding/status.ts"
import { inHousehold } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { OnboardingSchema } from "../../../../schemas/onboarding.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/auth/me/onboarding",
  operationId: "getOnboarding",
  tags: ["Sign-in"],
  summary: "Your tours and the household's first-meal progress",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(OnboardingSchema, "Onboarding progress."),
    ...SIGNED_IN_ERRORS,
  },
})
export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, userId, householdId } = inHousehold(c)
    return c.json(await onboardingStatus(em, userId, householdId), 200)
  })
}
