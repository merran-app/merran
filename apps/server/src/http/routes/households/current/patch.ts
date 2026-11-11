import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { Household } from "../../../../database/entities/index.ts"
import { inHouseholdTransaction } from "../../../../database/transactions.ts"
import { putsAwayWhenChecked } from "../../../../services/households/households.ts"
import { putAwayWhatsChecked } from "../../../../services/pantry/put-away/checking.ts"
import { asHouseholdAdmin } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  describeHousehold,
  HouseholdChangesSchema,
  HouseholdSchema,
} from "../../../schemas/households.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "patch",
  path: "/households/current",
  operationId: "updateHousehold",
  tags: ["Households"],
  summary: "Change the household",
  description: "Household admins only.",
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: HouseholdChangesSchema } },
    },
  },
  responses: {
    200: jsonResponse(HouseholdSchema, "Changed."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId, role, em } = asHouseholdAdmin(c)
    const household = await em.findOneOrFail(Household, householdId)
    const { meals, putAwayWhenChecked, recipeSharing, ...changes } =
      c.req.valid("json")
    // Only turning it on from off puts away what's already checked.
    const turnedOn =
      putAwayWhenChecked === true && !putsAwayWhenChecked(household.settings)
    em.assign(household, changes)
    // The meals it plans live with its other planning settings.
    if (meals) household.settings = { ...household.settings, meals }
    if (putAwayWhenChecked !== undefined) {
      household.settings = {
        ...household.settings,
        pantry: { ...household.settings?.pantry, putAwayWhenChecked },
      }
    }
    if (recipeSharing !== undefined) {
      household.settings = {
        ...household.settings,
        sharing: { ...household.settings?.sharing, recipes: recipeSharing },
      }
    }
    if (turnedOn) {
      // Saved in the same transaction as what it puts away, so the setting
      // is never on without the checked rows being in the pantry.
      const settings = household.settings
      await inHouseholdTransaction(em, householdId, async (tx) => {
        const saved = await tx.findOneOrFail(Household, householdId)
        saved.settings = settings
        await putAwayWhatsChecked(tx, householdId)
        await tx.flush()
      })
    }
    await em.flush()
    return c.json(describeHousehold(household, role), 200)
  })
}
