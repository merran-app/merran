import {
  AVOID_LEVELS,
  levelOf,
  NO_TASTES,
  type AvoidLevel,
  type HouseholdTastes,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { Household } from "../../database/entities/index.ts"

export async function getTastes(
  em: EntityManager,
  householdId: string
): Promise<HouseholdTastes> {
  const household = await em.findOneOrFail(Household, { id: householdId })
  return { ...NO_TASTES, ...household.settings?.tastes }
}

export async function saveTastes(
  em: EntityManager,
  householdId: string,
  tastes: HouseholdTastes
): Promise<HouseholdTastes> {
  const household = await em.findOneOrFail(Household, { id: householdId })
  // One of each food, the firmest winning: an allergy over never, never
  // over leave it out. What can't be left out is saved as never.
  const firmness = (level: AvoidLevel) =>
    AVOID_LEVELS.length - AVOID_LEVELS.indexOf(level)
  const foods = new Map<string, HouseholdTastes["avoid"][number]>()
  for (const item of tastes.avoid) {
    const food = item.food.trim()
    const key = food.toLowerCase()
    const level = levelOf(item)
    const who = item.who?.trim() || null
    const known = foods.get(key)
    foods.set(
      key,
      known && firmness(known.level) >= firmness(level)
        ? { ...known, who: known.who ?? who }
        : { food, level, who: who ?? known?.who ?? null }
    )
  }
  const saved: HouseholdTastes = {
    avoid: [...foods.values()],
    diets: [...new Set(tastes.diets)],
    weeknightMinutes: tastes.weeknightMinutes,
  }
  household.settings = { ...household.settings, tastes: saved }
  await em.flush()
  return saved
}
