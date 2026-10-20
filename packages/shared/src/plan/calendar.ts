import { MEALS, type Meal } from "./days.ts"

export type MealTime = { start: string; minutes: number }
export type MealTimes = Record<Meal, MealTime>

/** Local household times used until a dated meal has its own time. */
export const DEFAULT_MEAL_TIMES: MealTimes = {
  breakfast: { start: "08:00", minutes: 30 },
  lunch: { start: "12:00", minutes: 45 },
  dinner: { start: "18:00", minutes: 60 },
  snack: { start: "15:00", minutes: 30 },
}

export function mealTimes(saved: Partial<MealTimes> | undefined): MealTimes {
  return Object.fromEntries(
    MEALS.map((meal) => [meal, saved?.[meal] ?? DEFAULT_MEAL_TIMES[meal]])
  ) as MealTimes
}
