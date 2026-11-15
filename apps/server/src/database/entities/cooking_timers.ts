import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { householdFilter } from "../scope.ts"
import { CookingSession } from "./cooking_sessions.ts"
import { createdAt, id, updatedAt } from "./base.ts"
import { householdRef } from "./households.ts"

/** Where a timer stands: counting down, gone off, or cancelled before it did. */
export const TIMER_STATES = ["running", "finished", "cancelled"] as const

/**
 * A kitchen timer from cook view, kept on the server so it goes off on time
 * even when the device that started it sleeps.
 */
export const CookingTimer = defineEntity({
  name: "CookingTimer",
  tableName: "cooking_timers",
  properties: {
    id: id(),
    household: () => householdRef(),
    // Indexed because Postgres doesn't index a foreign key on its own.
    session: () =>
      p.manyToOne(CookingSession).ref().deleteRule("cascade").index(),
    /** The id cook view gave it. */
    timerId: p.string(),
    label: p.string(),
    /** Its length when started, with each minute added. */
    seconds: p.integer(),
    endsAt: p.datetime(),
    state: p.enum(TIMER_STATES).default("running"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  uniques: [{ properties: ["session", "timerId"] }],
  filters: householdFilter,
})
export type CookingTimer = InferEntity<typeof CookingTimer>
