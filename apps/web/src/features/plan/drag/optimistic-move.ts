import { isDay, MEALS } from "@merran/shared"
import type { QueryClient, QueryKey } from "@tanstack/react-query"

import type { Meal, PlanEntry, PlanSnapshot } from "../queries"

type Plan = { entries: PlanEntry[] }
type Place = Pick<PlanEntry, "date" | "anyDay" | "meal" | "position">
type Change = { before: PlanEntry; after: PlanEntry }
const ranges = {
  predicate: ({ queryKey }: { queryKey: QueryKey }) =>
    queryKey[0] === "plan" &&
    queryKey.length === 3 &&
    typeof queryKey[1] === "string" &&
    isDay(queryKey[1]) &&
    typeof queryKey[2] === "string" &&
    isDay(queryKey[2]),
}
const samePlace = (a: Place, b: Place) =>
  a.date === b.date &&
  a.meal === b.meal &&
  a.anyDay === b.anyDay &&
  a.position === b.position

/** Move cached entries between every loaded range, without touching other meals. */
async function placeEntries(
  client: QueryClient,
  place: (entries: Map<string, PlanEntry>) => Map<string, Place>
) {
  await client.cancelQueries(ranges)
  const cached = client.getQueriesData<Plan>(ranges)
  const entries = new Map(
    cached.flatMap(([, plan]) =>
      (plan?.entries ?? []).map((entry) => [entry.id, entry] as const)
    )
  )
  const changes = new Map<string, Change>()
  for (const [id, location] of place(new Map(entries))) {
    const entry = entries.get(id)
    if (entry)
      changes.set(id, { before: entry, after: { ...entry, ...location } })
  }

  const apply = (reverse: boolean) => {
    // Read each cache again: a live update or another move may have happened.
    const latest = client.getQueriesData<Plan>(ranges)
    const currentEntries = new Map(
      latest.flatMap(([, plan]) =>
        (plan?.entries ?? []).map((entry) => [entry.id, entry] as const)
      )
    )
    const eligible = new Set(
      [...changes]
        .filter(([id, change]) => {
          const current = currentEntries.get(id)
          return (
            !reverse ||
            (current
              ? samePlace(current, change.after)
              : !latest.some(
                  ([key]) =>
                    change.after.date >= (key[1] as string) &&
                    change.after.date <= (key[2] as string)
                ))
          )
        })
        .map(([id]) => id)
    )
    for (const [key] of latest) {
      client.setQueryData<Plan>(key, (plan) => {
        if (!plan) return plan
        let next = plan.entries
        for (const [id, change] of changes) {
          if (!eligible.has(id)) continue
          const from = reverse ? change.after : change.before
          const to = reverse ? change.before : change.after
          const current = next.find((entry) => entry.id === id)
          if (current && !samePlace(current, from)) continue
          next = next.filter((entry) => entry.id !== id)
          if (to.date >= (key[1] as string) && to.date <= (key[2] as string)) {
            // Roll back only its location; keep any updated recipe or status.
            next = [
              ...next,
              {
                ...(currentEntries.get(id) ?? current ?? to),
                date: to.date,
                anyDay: to.anyDay,
                meal: to.meal,
                position: to.position,
              },
            ]
          }
        }
        return {
          ...plan,
          entries: [...next].sort(
            (a, b) =>
              a.date.localeCompare(b.date) ||
              MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) ||
              a.position - b.position
          ),
        }
      })
    }
  }
  apply(false)
  return () => apply(true)
}

/** The server appends a moved meal to its destination slot. */
export function optimisticMove(
  client: QueryClient,
  ids: string[],
  to: { date: string; anyDay: boolean; meal?: Meal }
) {
  return placeEntries(client, (entries) => {
    const locations = new Map<string, Place>()
    for (const id of ids) {
      const entry = entries.get(id)
      if (!entry) continue
      const slot = { ...to, meal: to.meal ?? entry.meal }
      if (
        entry.date === slot.date &&
        entry.anyDay === slot.anyDay &&
        entry.meal === slot.meal
      )
        continue
      const positions = [...entries.values()]
        .filter(
          (other) =>
            other.date === slot.date &&
            other.anyDay === slot.anyDay &&
            other.meal === slot.meal
        )
        .map((other) => other.position)
      const position = Math.max(-1, ...positions) + 1
      const moved = { ...entry, ...slot, position }
      entries.set(id, moved)
      locations.set(id, moved)
    }
    return locations
  })
}

/** Undo for a move restores locations immediately too. */
export function optimisticMoveUndo(
  client: QueryClient,
  before: PlanSnapshot[]
) {
  return placeEntries(
    client,
    () => new Map(before.map((entry) => [entry.id, entry]))
  )
}
