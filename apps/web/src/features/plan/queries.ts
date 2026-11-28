import { queryOptions, useQuery } from "@tanstack/react-query"

import { householdQuery } from "@/features/household/queries"
import { api, unwrap, type Schemas } from "@/lib/api/client"

import { clockOf } from "./clock"

export type PlanEntry = Schemas["PlanEntry"]
export type PlanSnapshot = Schemas["PlanEntrySnapshot"]
export type Meal = PlanEntry["meal"]
export type Suggestion = Schemas["Suggestions"]["suggestions"][number]
export type PlanSlot = { date: string; meal: Meal }

/** Recipes for a meal or more, saying why. */
export const suggest = (slots: PlanSlot[], exclude: string[] = []) =>
  unwrap(api.POST("/api/plan/suggest", { body: { slots, exclude } }))

/** The plan from one day to another, the week's pool included. */
export const planQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["plan", from, to],
    queryFn: () =>
      unwrap(api.GET("/api/plan", { params: { query: { from, to } } })),
  })

/** The weekly autoplan: when it runs, what it fills, its next and last run. */
export const autoplanQuery = queryOptions({
  queryKey: ["plan", "autoplan"],
  queryFn: () => unwrap(api.GET("/api/plan/autoplan")),
})

/** What's next, checked again now and then as the day goes on. */
export const nextMealQuery = queryOptions({
  queryKey: ["plan", "next"],
  queryFn: () => unwrap(api.GET("/api/plan/next")),
  refetchInterval: 5 * 60_000,
})

/** The household's clock, from the household once it's loaded. */
export function useHouseholdClock() {
  return clockOf(useQuery(householdQuery).data)
}
