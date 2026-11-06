import type { MealShare } from "@merran/shared"
import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { aisleRef } from "./aisles.ts"
import { amount, createdAt, foodKey, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"
import { ShoppingList } from "./shopping_lists.ts"

export const ITEM_SOURCES = [
  "plan",
  "typed",
  "every-week",
  "usual",
  "assistant",
] as const

/**
 * What checking a row off put in the pantry, so unchecking it takes
 * exactly that back out.
 */
export type PutAwayRecord = {
  /** The pantry item it went into; null for household things and staples. */
  pantryItem: string | null
  /** How much it added there. */
  quantity: number | null
  unit: string | null
  amountText: string | null
  /** It made that pantry item, rather than joining one already there. */
  created: boolean
  /** The meal shares it brought. */
  forMeals: MealShare[]
  /** The purchase it recorded. */
  purchase: string
  /** When "Where did it all go?" showed it. */
  lookedOverAt: string | null
}

export const ShoppingItem = defineEntity({
  name: "ShoppingItem",
  tableName: "shopping_items",
  properties: {
    id: id(),
    household: () => householdRef(),
    list: () => p.manyToOne(ShoppingList).ref().deleteRule("cascade").index(),
    /** Merges the same food from different recipes into one line. */
    foodKey: foodKey().nullable(),
    name: p.string(),
    ...amount(),
    aisle: () => aisleRef(),
    checked: p.boolean().default(false),
    checkedAt: p.datetime().nullable(),
    source: p.enum(ITEM_SOURCES),
    /**
     * The planned meals it's for, and how much is each one's, so taking a
     * meal off the plan takes its share off the list.
     */
    forMeals: p.json<MealShare[]>().nullable(),
    /** What checking it off put in the pantry, while it's checked. */
    putAway: p.json<PutAwayRecord>().nullable(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  filters: householdFilter,
})
export type ShoppingItem = InferEntity<typeof ShoppingItem>
