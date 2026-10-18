import { createRoute } from "@hono/zod-openapi"
import { LockMode } from "@mikro-orm/core"
import type { AppDeps } from "../../../../../core/context.ts"
import { Household, User } from "../../../../../database/entities/index.ts"
import { onboardingStatus } from "../../../../../services/onboarding/status.ts"
import { asHouseholdAdmin, inHousehold } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  OnboardingChangesSchema,
  OnboardingSchema,
} from "../../../../schemas/onboarding.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "patch",
  path: "/auth/me/onboarding",
  operationId: "updateOnboarding",
  tags: ["Sign-in"],
  summary: "Remember tours and onboarding choices",
  description:
    "Personal choices belong to the signed-in person. Only household owners/admins can mark household preferences reviewed. Progress is derived from household data, never accepted from the client.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: OnboardingChangesSchema } },
    },
  },
  responses: {
    200: jsonResponse(OnboardingSchema, "Remembered."),
    ...SIGNED_IN_ERRORS,
  },
})
export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, userId, householdId } = inHousehold(c)
    const changes = c.req.valid("json")
    if (changes.reviewed) asHouseholdAdmin(c)
    await em.transactional(async (tx) => {
      const person = await tx.findOneOrFail(User, userId, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      })
      const preferences = person.preferences ?? {}
      person.preferences = {
        ...preferences,
        tours: changes.resetTours
          ? {}
          : changes.tour
            ? { ...preferences.tours, [changes.tour.id]: changes.tour.version }
            : preferences.tours,
        onboarding: {
          ...preferences.onboarding,
          ...(changes.dismissed !== undefined
            ? { dismissed: changes.dismissed }
            : {}),
          ...(changes.toursDisabled !== undefined
            ? { toursDisabled: changes.toursDisabled }
            : {}),
        },
      }
      if (changes.reviewed || changes.recordProgress) {
        const household = await tx.findOneOrFail(Household, householdId, {
          lockMode: LockMode.PESSIMISTIC_WRITE,
        })
        const status = await onboardingStatus(tx, userId, householdId)
        household.settings = {
          ...household.settings,
          onboarding: {
            ...household.settings?.onboarding,
            ...status.progress,
            ...(changes.reviewed ? { reviewed: true } : {}),
          },
        }
      }
    })
    return c.json(await onboardingStatus(em, userId, householdId), 200)
  })
}
