import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"
import { User } from "./users.ts"

/** One person's revocable, read-only link to the household meal calendar. */
export const CalendarSubscription = defineEntity({
  name: "CalendarSubscription",
  tableName: "calendar_subscriptions",
  properties: {
    id: id(),
    household: () => householdRef(),
    user: () => p.manyToOne(User).ref().deleteRule("cascade").index(),
    tokenHash: p.string().unique(),
    createdAt: createdAt(),
    revokedAt: p.datetime().nullable(),
  },
  filters: householdFilter,
})
export type CalendarSubscription = InferEntity<typeof CalendarSubscription>
