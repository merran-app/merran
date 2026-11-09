import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"
import { Recipe } from "./recipes.ts"
import { User } from "./users.ts"

/**
 * A recipe's public link: anyone with the token can read it. One per recipe,
 * so stopping sharing deletes the row and sharing again makes a new token.
 */
export const RecipeShare = defineEntity({
  name: "RecipeShare",
  tableName: "recipe_shares",
  properties: {
    id: id(),
    household: () => householdRef(),
    recipe: () => p.manyToOne(Recipe).ref().deleteRule("cascade").unique(),
    token: p.string().unique(),
    /** Who shared it. The link outlives them. */
    createdBy: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    createdAt: createdAt(),
    openedAt: p.datetime().nullable(),
  },
  filters: householdFilter,
})
export type RecipeShare = InferEntity<typeof RecipeShare>
