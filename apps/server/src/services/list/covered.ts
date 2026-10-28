import {
  addAmounts,
  addDays,
  combineLines,
  covers,
  formatAmount,
  subtractAmounts,
  type Amount,
  type CombinedItem,
  type MealShare,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  PantryItem,
  PlanEntry,
  ShoppingItem,
  type SetAside,
} from "../../database/entities/index.ts"
import { NOT_DELETED_FILTER } from "../../database/scope.ts"
import { inHouseholdTransaction } from "../../database/transactions.ts"
import { householdAliases, householdKeys } from "../foods/aliases.ts"
import { householdToday } from "../households/clock.ts"
import {
  itemSnapshot as pantrySnapshot,
  onTheList,
  pantryMeals,
  removeItem,
  shortOf,
  type PantrySnapshotItem,
} from "../pantry/pantry.ts"
import { hasRecipe, loadMealLines } from "../plan/meal-lines.ts"
import { aislesOf } from "./aisles.ts"
import { itemSnapshot } from "./list.ts"
import { listsOf } from "./lists.ts"
import { addMealNeeds, onHandOf } from "./meals.ts"

// What the pantry is covering for meals on the list, so the list can say
// what it left off and why. And when something at home turns out not to
// be there, what meals on the list are short of goes back on the list.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Amounts as they show, joined with "+". */
const amountsOf = (amounts: readonly Amount[]) =>
  amounts
    .map((amount) => formatAmount(amount.quantity, amount.unit))
    .filter(Boolean)
    .join(" + ")

/**
 * Amounts of a food added up where they add up: a cup and half a cup are
 * one and a half.
 */
function addedUp(amounts: readonly Amount[], food: string) {
  const out: Amount[] = []
  for (const amount of amounts) {
    const index = out.findIndex(
      (other) => addAmounts(other, amount, food) !== null
    )
    if (index === -1) out.push({ quantity: amount.quantity, unit: amount.unit })
    else out[index] = addAmounts(out[index]!, amount, food)!
  }
  return out
}

/** How much of each share was counted on, as a share. */
const countedOf = (shares: readonly SetAside[]) =>
  shares.flatMap((share) =>
    share.counted ? [{ meal: share.meal, ...share.counted }] : []
  )

/**
 * What's at home that the list counted on for meals on it still to come:
 * each thing, how much of it, which meals, and what's still to buy for
 * those meals when it covers only part. Each says which list it would be
 * on. And what's always on hand that those meals use, which the list
 * leaves off by a setting rather than for what's at home.
 */
export async function coveredAtHome(em: EntityManager, householdId: string) {
  const [pantry, today] = await Promise.all([
    em.find(PantryItem, {}, { orderBy: { name: "asc" } }),
    householdToday(em, householdId),
  ])
  const meals = await pantryMeals(em, pantry)
  const counted = pantry.flatMap((item) => {
    const shares = countedOf(item.forMeals ?? []).filter((share) =>
      onTheList(meals.get(share.meal), today)
    )
    return shares.length > 0 ? [{ item, shares }] : []
  })
  const waiting = await em.find(ShoppingItem, { checked: false })
  const lists = await listsFor(
    em,
    householdId,
    counted.map(({ item }) => item),
    waiting
  )

  const items = counted.map(({ item, shares }, index) => {
    const ids = [...new Set(shares.map((share) => share.meal))]
    // What the same meals still need of it on the list: the food itself,
    // or a food it's a kind of, each line's shares added up.
    const toBuy = waiting
      .filter((line) => line.foodKey && covers(item.foodKey, line.foodKey))
      .flatMap((line) =>
        addedUp(
          (line.forMeals ?? []).filter((share) => ids.includes(share.meal)),
          line.foodKey!
        )
      )
    return {
      id: item.id,
      name: item.name,
      list: lists[index]!,
      amount: amountsOf(addedUp(shares, item.foodKey)),
      meals: ids
        .map((id) => meals.get(id)!)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((meal) => ({
          id: meal.id,
          name: meal.name,
          date: meal.date,
          anyDay: meal.anyDay,
          amount: amountsOf(shares.filter((share) => share.meal === meal.id)),
        })),
      stillToBuy: amountsOf(toBuy) || null,
    }
  })
  return { items, onHand: await onHandUsed(em, householdId, today) }
}

/**
 * The list each thing would go on: the one its food is on already, or
 * where the list puts that food.
 */
async function listsFor(
  em: EntityManager,
  householdId: string,
  items: readonly PantryItem[],
  waiting: readonly ShoppingItem[]
) {
  const aisles = await aislesOf(em, householdId, items)
  const routed = await listsOf(
    em,
    householdId,
    items.map((item, index) => ({ name: item.name, aisle: aisles[index] }))
  )
  return items.map((item, index) => {
    const line = waiting.find(
      (line) => line.foodKey && covers(item.foodKey, line.foodKey)
    )
    return line?.list.id ?? routed[index]!.id
  })
}

/** What's always on hand that meals on the list still to come use. */
async function onHandUsed(
  em: EntityManager,
  householdId: string,
  today: string
) {
  const entries = await em.find(
    PlanEntry,
    {
      listedAt: { $ne: null },
      status: "planned",
      recipe: { $ne: null },
      // A week's pool is dated to its first day.
      date: { $gte: addDays(today, -6) },
    },
    { populate: ["recipe"], filters: { [NOT_DELETED_FILTER]: false } }
  )
  const meals = entries.filter(hasRecipe)
  if (meals.length === 0) return []
  const [linesOf, isOnHand, aliases] = await Promise.all([
    loadMealLines(em, householdId, meals),
    onHandOf(em, householdId),
    householdAliases(em),
  ])
  const names = combineLines(meals.flatMap(linesOf), aliases)
    .map((item) => item.name.toLowerCase())
    .filter((name) => isOnHand(name))
  return [...new Set(names)].sort()
}

/** What to put back on the list: things used up, and things that ran low. */
export type Short = {
  /** Things used up, as they were: all they were set aside for. */
  removed?: readonly PantrySnapshotItem[]
  /** Things at home, by id: what there isn't enough of any more. */
  items?: readonly string[]
}

/**
 * What meals on the list still to come are short of, on the list: all
 * that was set aside for them in things used up, and what things at home
 * don't have enough of any more, which stops being set aside. Says what
 * the list and the pantry were, for Undo.
 */
export async function putShortOnList(
  em: EntityManager,
  householdId: string,
  short: Short
) {
  return inHouseholdTransaction(em, householdId, (tx) =>
    shortOnList(tx, householdId, short)
  )
}

/**
 * Something at home isn't, after all: it's used up, and what meals on the
 * list counted on it goes on the list. Says what the list and the pantry
 * were, for Undo.
 */
export async function notAtHome(
  em: EntityManager,
  householdId: string,
  id: string
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const gone = await removeItem(tx, id)
    const result = await shortOnList(tx, householdId, { removed: [gone] })
    return { ...result, pantry: [gone, ...result.pantry] }
  })
}

async function shortOnList(
  em: EntityManager,
  householdId: string,
  { removed = [], items = [] }: Short
) {
  const [keyOf, today] = await Promise.all([
    householdKeys(em),
    householdToday(em, householdId),
  ])
  const rows =
    items.length > 0
      ? await em.find(PantryItem, {
          id: { $in: items.filter((id) => UUID.test(id)) },
        })
      : []
  const meals = await pantryMeals(em, [...removed, ...rows])

  const needs: CombinedItem[] = []
  for (const thing of removed) {
    const shares = (thing.forMeals ?? []).filter((share) =>
      onTheList(meals.get(share.meal), today)
    )
    if (shares.length > 0)
      needs.push(need(thing.name, thing.foodKey || keyOf(thing.name), shares))
  }
  const pantry: PantrySnapshotItem[] = []
  for (const row of rows) {
    const short = shortOf(row, meals, today)
    if (short.length === 0) continue
    pantry.push(pantrySnapshot(row))
    // What isn't there stops being set aside for them.
    row.forMeals = lessShort(row.forMeals ?? [], short, row.foodKey)
    needs.push(need(row.name, row.foodKey, short))
  }
  return { ...(await addNeeds(em, householdId, needs)), pantry }
}

/** A food meals need, as the list adds it: its shares added up. */
function need(
  name: string,
  food: string,
  shares: readonly MealShare[]
): CombinedItem {
  const own = shares.map(({ meal, quantity, unit }) => ({
    meal,
    quantity,
    unit,
  }))
  let total: Amount = { quantity: own[0]!.quantity, unit: own[0]!.unit }
  for (const share of own.slice(1))
    total = addAmounts(total, share, food) ?? total
  return { key: food, food, name, sources: [], shares: own, ...total }
}

/**
 * Shares less what they're short of. How much was counted on is never
 * more than what's left set aside.
 */
function lessShort(
  shares: readonly SetAside[],
  short: readonly MealShare[],
  food: string
) {
  const kept: SetAside[] = []
  for (const share of shares) {
    const missing = short.find((other) => other.meal === share.meal)
    if (!missing) {
      kept.push(share)
      continue
    }
    const rest = subtractAmounts(share, missing, food)
    if (!rest || rest.quantity <= 0.001) continue
    const left: SetAside = { meal: share.meal, ...rest }
    if (share.counted) {
      const over = subtractAmounts(rest, share.counted, food)
      left.counted = over && over.quantity < 0 ? rest : share.counted
    }
    kept.push(left)
  }
  return kept.length > 0 ? kept : null
}

/**
 * Puts what meals need on the list, added into what's there. Says how
 * many lines were new or added to, and for Undo, the lines added to as
 * they were and the new ones' ids.
 */
async function addNeeds(
  em: EntityManager,
  householdId: string,
  needs: readonly CombinedItem[]
) {
  const foods = [...new Set(needs.map((item) => item.food))]
  const lines =
    foods.length > 0
      ? await em.find(ShoppingItem, { checked: false, foodKey: { $in: foods } })
      : []
  const before = lines.map(itemSnapshot)
  const { added, merged } = await addMealNeeds(em, householdId, needs)
  await em.flush()
  const had = new Set(lines.map((line) => line.id))
  const now =
    foods.length > 0
      ? await em.find(ShoppingItem, { checked: false, foodKey: { $in: foods } })
      : []
  return {
    added,
    merged,
    before: before.filter(
      (was, index) =>
        JSON.stringify(was) !== JSON.stringify(itemSnapshot(lines[index]!))
    ),
    remove: now.filter((line) => !had.has(line.id)).map((line) => line.id),
  }
}
