import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { COOKING_OUTCOMES } from "@merran/shared"
import { householdFilter } from "../scope.ts"
import { createdAt, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"
import { PlanEntry } from "./plan_entries.ts"
import { Recipe, recipeRef } from "./recipes.ts"
import { User } from "./users.ts"

/**
 * Someone cooking a recipe in cook view, on one device, from leaving Get
 * ready until cooking ends. It's what's happening now, not a history: the
 * daily clean-up clears sessions after a month (docs/webhooks.md).
 */
export const CookingSession = defineEntity({
  name: "CookingSession",
  tableName: "cooking_sessions",
  properties: {
    id: id(),
    household: () => householdRef(),
    /** Who's cooking: the only one who can change the session. */
    cook: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    recipe: () => recipeRef(),
    /** The recipe cooked with it, as a pairing. */
    paired: () =>
      p.manyToOne(Recipe).ref().nullable().deleteRule("set null").index(),
    /** The planned meal it's cooked for. */
    entry: () =>
      p.manyToOne(PlanEntry).ref().nullable().deleteRule("set null").index(),
    servings: p.double().nullable(),
    startedAt: createdAt(),
    /** When cook view last said it's still cooking. */
    heardAt: p.datetime(),
    /** Cook view was left with a timer running: it ends when they're done. */
    leftAt: p.datetime().nullable(),
    /** Cook view's page went away: it ends then, unless cook view comes back. */
    closingAt: p.datetime().nullable(),
    endedAt: p.datetime().nullable(),
    outcome: p.enum(COOKING_OUTCOMES).nullable(),
    updatedAt: updatedAt(),
  },
  indexes: [{ properties: ["household", "endedAt"] }],
  filters: householdFilter,
})
export type CookingSession = InferEntity<typeof CookingSession>
