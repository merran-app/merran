import { MEALS, mealTimes, type Meal, type MealTime } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  PlanEntry,
  PlanSlotTime,
  type Household,
  type Recipe,
} from "../../../database/entities/index.ts"
import { NOT_DELETED_FILTER } from "../../../database/scope.ts"
import { calendarInstant } from "../../plan/calendar/time.ts"
import { recipeRef, type Dish } from "../payloads.ts"

// The day's meals as the heads-ups see them: each dated meal (a slot) with
// its time, as the plan shows it, and its dishes with how long each takes.

/** A planned meal on a day, with its dishes. */
export type Slot = {
  date: string
  meal: Meal
  /** HH:mm on the household's clock. */
  time: string
  /** When it's served. */
  serveAt: Date
  dishes: Dish[]
}

/** Which dishes count: the summary leaves out Didn't; time to start, made ones too. */
type Statuses = readonly PlanEntry["status"][]

/**
 * The household's meals on these days, in each day's order: by their time,
 * then breakfast to snack. A meal's time is the one set for that day, or
 * the household's usual time for it, as the plan shows it. Dishes whose
 * recipe is in Recently deleted are left out, as the calendar leaves them.
 */
export async function slotsOn(
  em: EntityManager,
  household: Household,
  days: readonly string[],
  statuses: Statuses
): Promise<Slot[]> {
  const [entries, overrides] = await Promise.all([
    em.find(
      PlanEntry,
      {
        date: { $in: [...days] },
        anyDay: false,
        status: { $in: [...statuses] },
      },
      {
        populate: ["recipe", "withRecipe"],
        filters: { [NOT_DELETED_FILTER]: false },
        orderBy: { position: "asc", createdAt: "asc" },
      }
    ),
    em.find(PlanSlotTime, { date: { $in: [...days] } }),
  ])
  const usual = mealTimes(household.settings?.calendar?.times)
  const setFor = new Map(
    overrides.map((slot) => [`${slot.date}:${slot.meal}`, slot])
  )

  const slots = new Map<string, Slot>()
  for (const entry of entries) {
    if (entry.recipe?.getEntity().deletedAt) continue
    const key = `${entry.date}:${entry.meal}`
    let slot = slots.get(key)
    if (!slot) {
      const time: MealTime = setFor.get(key) ?? usual[entry.meal]
      slot = {
        date: entry.date,
        meal: entry.meal,
        time: time.start,
        serveAt: calendarInstant(entry.date, time.start, household.timeZone),
        dishes: [],
      }
      slots.set(key, slot)
    }
    slot.dishes.push(dishOf(entry))
  }

  return [...slots.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time) ||
      MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal)
  )
}

/** A dish as the heads-ups carry it, named as the plan names it. */
function dishOf(entry: PlanEntry): Dish {
  const main = entry.recipe?.getEntity()
  const side = shown(entry.withRecipe?.getEntity())
  const variant = entry.variants?.find((value) => value.recipeId === main?.id)
  const minutes = [minutesFor(main), minutesFor(side)].filter(
    (value): value is number => value !== null
  )

  return {
    entryId: entry.id,
    title: variant?.name ?? main?.name ?? entry.note ?? "",
    recipe: main ? recipeRef(main) : null,
    side: side ? recipeRef(side) : null,
    totalMinutes: minutes.length > 0 ? Math.max(...minutes) : null,
  }
}

/** A side as the plan shows it: none while it's in Recently deleted. */
function shown(recipe: Recipe | undefined): Recipe | undefined {
  return recipe && !recipe.deletedAt ? recipe : undefined
}

/**
 * How long a recipe takes, in minutes: its total time, or its prep and
 * cook times added up when it has no total. Null when it says neither.
 */
export function minutesFor(
  recipe:
    Pick<Recipe, "totalMinutes" | "prepMinutes" | "cookMinutes"> | undefined
): number | null {
  if (!recipe) return null
  if (recipe.totalMinutes && recipe.totalMinutes > 0) {
    return recipe.totalMinutes
  }
  const added = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)
  return added > 0 ? added : null
}

/** The longest of a meal's dishes, in minutes, or null when none says. */
export function longestDish(dishes: readonly Dish[]): number | null {
  const minutes = dishes
    .map((dish) => dish.totalMinutes)
    .filter((value): value is number => value !== null)
  return minutes.length > 0 ? Math.max(...minutes) : null
}
