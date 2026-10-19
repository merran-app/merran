import { addDays, weekStartOf } from "@merran/shared"
import { useQuery } from "@tanstack/react-query"

import { planQuery, useHouseholdClock } from "./queries"

/** Main dishes and sides already on the week, including its any-day pool. */
export function usePlannedRecipes(date?: string | null) {
  const clock = useHouseholdClock()
  const week = weekStartOf(date ?? clock.today, clock.weekStartsOn)
  const plan = useQuery({
    ...planQuery(week, addDays(week, 6)),
    enabled: date !== null,
  })
  const ids = new Set<string>()
  for (const entry of plan.data?.entries ?? []) {
    // Cooked meals still count toward variety for the week; skipped ones don't.
    if (entry.status === "skipped") continue
    if (entry.recipe) ids.add(entry.recipe.id)
    if (entry.withRecipe) ids.add(entry.withRecipe.id)
  }
  return ids
}
