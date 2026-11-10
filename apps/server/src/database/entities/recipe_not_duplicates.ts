import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"
import { Recipe, recipeRef } from "./recipes.ts"
import { User } from "./users.ts"

/**
 * Two recipes someone in the household said aren't the same, so they
 * aren't shown as possible duplicates again. Kept once, `first` being the
 * one with the smaller id; it goes when either is deleted for good.
 */
export const RecipeNotDuplicate = defineEntity({
  name: "RecipeNotDuplicate",
  tableName: "recipe_not_duplicates",
  properties: {
    id: id(),
    household: () => householdRef(),
    first: () => recipeRef(),
    second: () => p.manyToOne(Recipe).ref().deleteRule("cascade").index(),
    createdBy: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    createdAt: createdAt(),
  },
  uniques: [{ properties: ["first", "second"] }],
  filters: householdFilter,
})
export type RecipeNotDuplicate = InferEntity<typeof RecipeNotDuplicate>
