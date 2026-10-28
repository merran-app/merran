import { STORAGE_PLACES, type Amount, type MealShare } from "@merran/shared"
import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { aisleRef } from "./aisles.ts"
import { amount, createdAt, day, foodKey, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"

export { STORAGE_PLACES }

/**
 * How much of something at home is set aside for a planned meal. `counted`
 * is how much of that was counted on when the meal went on the list, so it
 * kept that much off the list; the rest was bought for the meal.
 */
export type SetAside = MealShare & { counted?: Amount }

export const PantryItem = defineEntity({
  name: "PantryItem",
  tableName: "pantry_items",
  properties: {
    id: id(),
    household: () => householdRef(),
    /** The pantry's match key: prep and quality words dropped ("chicken thigh"). */
    foodKey: foodKey(),
    name: p.string(),
    ...amount(),
    aisle: () => aisleRef(),
    storedIn: p.enum(STORAGE_PLACES).nullable(),
    useBy: day().nullable(),
    /**
     * The planned meals it's set aside for, and how much is each one's:
     * bought for them, or counted on when they went on the list. Cooking
     * one uses its share.
     */
    forMeals: p.json<SetAside[]>().nullable(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  indexes: [{ properties: ["household", "foodKey"] }],
  filters: householdFilter,
})
export type PantryItem = InferEntity<typeof PantryItem>
