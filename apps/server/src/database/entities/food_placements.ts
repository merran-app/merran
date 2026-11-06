import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { STORAGE_PLACES } from "@merran/shared"
import { householdFilter } from "../scope.ts"
import { aisleRef } from "./aisles.ts"
import { foodKey, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"
import { ShoppingList } from "./shopping_lists.ts"

/**
 * Where the household keeps sending a food, learned when someone moves it.
 * It wins over the aisle's usual list. `storedIn` is where it's kept at
 * home, learned when all of it is moved to another place.
 */
export const FoodPlacement = defineEntity({
  name: "FoodPlacement",
  tableName: "food_placements",
  properties: {
    id: id(),
    household: () => householdRef(),
    foodKey: foodKey(),
    aisle: () => aisleRef(),
    list: () =>
      p.manyToOne(ShoppingList).ref().nullable().deleteRule("set null"),
    storedIn: p.enum(STORAGE_PLACES).nullable(),
    updatedAt: updatedAt(),
  },
  uniques: [{ properties: ["household", "foodKey"] }],
  filters: householdFilter,
})
export type FoodPlacement = InferEntity<typeof FoodPlacement>
