import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { MEALS } from "@merran/shared"
import { householdFilter } from "../scope.ts"
import { day, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"

/** One day's meal time, shared by every dish in that slot. */
export const PlanSlotTime = defineEntity({
  name: "PlanSlotTime",
  tableName: "plan_slot_times",
  properties: {
    id: id(),
    household: () => householdRef(),
    date: day(),
    meal: p.enum(MEALS),
    start: p.string().length(5),
    minutes: p.integer(),
    updatedAt: updatedAt(),
  },
  uniques: [{ properties: ["household", "date", "meal"] }],
  filters: householdFilter,
})
export type PlanSlotTime = InferEntity<typeof PlanSlotTime>
