import { householdClock, middayOn } from "../households/clock.ts"
import {
  addDays,
  daysBetween,
  isDay,
  MEALS,
  mealOfTheHour,
  nextMeal,
  weekStartOf,
  type Meal,
  type Reason,
} from "@merran/shared"
import { LockMode } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import {
  Household,
  PlanEntry,
  Recipe,
  type PLAN_STATUSES,
} from "../../database/entities/index.ts"
import { HOUSEHOLD_FILTER, NOT_DELETED_FILTER } from "../../database/scope.ts"
import { followPlan, shoppingFor } from "../list/meals.ts"
import { followCooking } from "../pantry/cooking.ts"
import { photoUrls } from "../recipes/photos/photos.ts"
import { inHouseholdTransaction } from "../../database/transactions.ts"
import { toNumber } from "../../database/numbers.ts"
import { totalMinutes } from "../recipes/recipes.ts"
import { recordPlanEvents } from "../webhooks/events/plan.ts"
import { snapshotOf, type EntrySnapshot } from "./snapshots.ts"

export { snapshotOf, type EntrySnapshot }

// The week plan: meals on days, and the week's pool of meals for any day.
// "Today" is always the household's, in its own time zone. The shopping
// list follows it: changing a meal on the list changes the list too. And
// the pantry follows cooking: a cooked meal uses what it takes, and puts
// it back if it turns out it wasn't cooked.

export type PlanStatus = (typeof PLAN_STATUSES)[number]

/** The most days the plan is read for at once. */
const MAX_DAYS = 62
/** How far ahead what's next looks. */
const NEXT_DAYS = 14

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Deleted recipes are loaded too, so their meals can be left out. */
const WITH_DELETED = { filters: { [NOT_DELETED_FILTER]: false } }
const POPULATE = ["recipe", "withRecipe"] as const

/** A recipe that's in Recently deleted takes its meals off the plan until it's back. */
const shown = (entry: PlanEntry) => {
  const recipe = entry.recipe?.getEntity()
  return !recipe?.deletedAt
}

function recipeSummary(recipe: Recipe | undefined | null) {
  if (!recipe || recipe.deletedAt) return null
  return {
    id: recipe.id,
    slug: recipe.slug,
    name: recipe.name,
    photo: photoUrls(recipe)?.card ?? null,
    servings: toNumber(recipe.servings),
    totalMinutes: totalMinutes(recipe),
    calories: recipe.nutrition?.calories ?? null,
  }
}

/** A meal on the plan as the API shows it. Its recipes are loaded. */
export function describeEntry(entry: PlanEntry) {
  const withRecipe = entry.withRecipe?.getEntity()
  const main = recipeSummary(entry.recipe?.getEntity())
  const variant = entry.variants?.find((value) => value.recipeId === main?.id)
  return {
    id: entry.id,
    date: entry.date,
    anyDay: entry.anyDay,
    meal: entry.meal,
    position: entry.position,
    status: entry.status,
    recipe:
      main && variant
        ? {
            ...main,
            name: variant.name,
            servings: variant.servings,
            calories: null,
          }
        : main,
    withRecipe:
      withRecipe && !withRecipe.deletedAt
        ? {
            id: withRecipe.id,
            slug: withRecipe.slug,
            name: withRecipe.name,
            calories: entry.variants?.some(
              (value) => value.recipeId === withRecipe.id
            )
              ? null
              : (withRecipe.nutrition?.calories ?? null),
          }
        : null,
    note: entry.note ?? null,
    servings: toNumber(entry.servings),
    why: entry.why ?? [],
    createdAt: entry.createdAt.toISOString(),
    variants: entry.variants ?? [],
  }
}

export type DescribedEntry = ReturnType<typeof describeEntry>

/** Meals in the order a day has them. */
export function sortEntries<
  T extends Pick<PlanEntry, "date" | "meal" | "position" | "anyDay">,
>(entries: T[]) {
  return [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(b.anyDay) - Number(a.anyDay) ||
      MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) ||
      a.position - b.position
  )
}

function checkDay(value: string, field: string) {
  if (!isDay(value)) {
    throw new AppError("invalid", "bad_day", "That isn't a day.", {
      [field]: 'Use a day written like "2026-10-15".',
    })
  }
}

/** The plan from one day to another, the week's pool included. */
export async function listPlan(
  em: EntityManager,
  { from, to }: { from: string; to: string }
) {
  checkDay(from, "from")
  checkDay(to, "to")
  const span = daysBetween(from, to)
  if (span < 0 || span > MAX_DAYS) {
    throw new AppError(
      "invalid",
      "bad_range",
      `Ask for up to ${MAX_DAYS} days at a time, from the first to the last.`
    )
  }
  const entries = await em.find(
    PlanEntry,
    { date: { $gte: from, $lte: to } },
    { populate: POPULATE, ...WITH_DELETED }
  )
  return sortEntries(entries.filter(shown)).map(describeEntry)
}

export async function findEntry(em: EntityManager, entryId: string) {
  const entry = UUID.test(entryId)
    ? await em.findOne(
        PlanEntry,
        { id: entryId },
        { populate: POPULATE, ...WITH_DELETED }
      )
    : null
  if (!entry || !shown(entry)) {
    throw new AppError(
      "not_found",
      "plan_entry_not_found",
      "That meal isn't on the plan."
    )
  }
  return entry
}

/** One of the household's recipes, by id or address. */
async function recipeFor(em: EntityManager, idOrSlug: string, field: string) {
  const recipe = await em.findOne(
    Recipe,
    UUID.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }
  )
  if (!recipe) {
    throw new AppError(
      "not_found",
      "recipe_not_found",
      "There's no such recipe.",
      {
        [field]: "There's no such recipe.",
      }
    )
  }
  return recipe
}

/** After the last meal in a slot: a day's meal, or the week's pool. */
async function nextPosition(
  em: EntityManager,
  slot: { date: string; meal: Meal; anyDay: boolean }
) {
  const last = await em.findOne(PlanEntry, slot, {
    orderBy: { position: "desc" },
  })
  return last ? last.position + 1 : 0
}

/** The household's day and time zone, to say when a meal was cooked. */
type Day = { today: string; timeZone: string }

/**
 * Cooked now: the recipe and its side were made now, or, for a meal on a
 * day gone by, that day. Once it's saved, `remade()` puts that on them,
 * and takes it off if it stops being cooked.
 */
function setStatus(entry: PlanEntry, status: PlanStatus, day?: Day) {
  if (status === entry.status) return
  entry.status = status
  entry.cookedAt = status === "cooked" ? cookedTime(entry, day) : null
}

/**
 * Now; but a meal on a day gone by was cooked that day, at midday, and one
 * in the pool of a week that's over, on that week's last day.
 */
function cookedTime(entry: PlanEntry, day?: Day) {
  const lastDay = entry.anyDay ? addDays(entry.date, 6) : entry.date
  if (!day || lastDay >= day.today) return new Date()
  return middayOn(lastDay, day.timeZone)
}

/** The recipes a meal says were made: its recipe and side, once it's cooked. */
function madeBy(entry: PlanEntry) {
  if (entry.status !== "cooked") return []
  return [entry.recipe?.id, entry.withRecipe?.id].filter(
    (id): id is string => id !== undefined
  )
}

/**
 * Works out again when recipes were last made, once meals are saved: the
 * latest of their cooked meals and when they were made off the plan. A
 * meal marked cooked by mistake, then not, leaves them as they were.
 */
async function remade(em: EntityManager, recipeIds: readonly string[]) {
  const ids = [...new Set(recipeIds)]
  if (ids.length === 0) return
  const recipes = await em.find(Recipe, { id: { $in: ids } }, WITH_DELETED)
  const cooked = await em.find(
    PlanEntry,
    {
      status: "cooked",
      $or: [{ recipe: { $in: ids } }, { withRecipe: { $in: ids } }],
    },
    WITH_DELETED
  )
  for (const recipe of recipes) {
    let latest = recipe.madeOffPlanAt ?? null
    for (const entry of cooked) {
      if (!entry.cookedAt || (latest && entry.cookedAt <= latest)) continue
      if (madeBy(entry).includes(recipe.id)) latest = entry.cookedAt
    }
    recipe.lastMadeAt = latest
  }
  await em.flush()
}

/** A meal must be a recipe or a note, and a side goes with a recipe. */
function checkShape(entry: PlanEntry) {
  if (!entry.recipe === !entry.note) {
    throw new AppError(
      "invalid",
      "recipe_or_note",
      "A meal is a recipe or a note, not both or neither."
    )
  }
  if (entry.withRecipe && !entry.recipe) {
    throw new AppError(
      "invalid",
      "side_needs_recipe",
      "A side goes with a recipe, not a note."
    )
  }
}

export type NewEntry = {
  date: string
  meal: Meal
  /** For the week's pool: any day of the week the date is in. */
  anyDay?: boolean
  recipe?: string | null
  withRecipe?: string | null
  note?: string | null
  servings?: number | null
  /** Why it was picked, by Fill the week. */
  why?: Reason[] | null
}

/** Makes a meal, after any already in its slot, ready to save. */
async function createEntry(
  em: EntityManager,
  householdId: string,
  input: NewEntry,
  weekStartsOn: number
) {
  checkDay(input.date, "date")
  const anyDay = input.anyDay ?? false
  const date = anyDay ? weekStartOf(input.date, weekStartsOn) : input.date
  const recipe = input.recipe
    ? await recipeFor(em, input.recipe, "recipe")
    : null
  const withRecipe = input.withRecipe
    ? await recipeFor(em, input.withRecipe, "withRecipe")
    : null
  const entry = em.create(PlanEntry, {
    household: householdId,
    date,
    anyDay,
    meal: input.meal,
    position: await nextPosition(em, { date, meal: input.meal, anyDay }),
    recipe,
    withRecipe,
    note: input.note?.trim() || null,
    servings: input.servings ?? null,
    status: "planned",
    why: input.why?.length ? input.why : null,
  })
  checkShape(entry)
  return entry
}

/** Puts a meal on the plan, after any already in its slot. */
export async function addEntry(
  em: EntityManager,
  householdId: string,
  input: NewEntry
) {
  const { weekStartsOn } = await householdClock(em, householdId)
  const entry = await createEntry(em, householdId, input, weekStartsOn)
  // Saves the meal with the event, so neither is left without the other.
  await recordPlanEvents(em, householdId, { before: [], after: [entry] })
  await em.flush()
  return describeEntry(entry)
}

/** Several meals at once, like Fill the week's: all or none. */
export async function addEntries(
  em: EntityManager,
  householdId: string,
  inputs: readonly NewEntry[]
) {
  const { weekStartsOn } = await householdClock(em, householdId)
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const added: PlanEntry[] = []
    for (const input of inputs) {
      added.push(await createEntry(tx, householdId, input, weekStartsOn))
      // Each after the one added before it in the same slot.
      await tx.flush()
    }
    await recordPlanEvents(tx, householdId, { before: [], after: added })
    return sortEntries(added).map(describeEntry)
  })
}

export type EntryChanges = Partial<{
  date: string
  meal: Meal
  anyDay: boolean
  recipe: string | null
  withRecipe: string | null
  note: string | null
  servings: number | null
  status: PlanStatus
  /** Why it was picked: Something else says so. */
  why: Reason[] | null
}>

/** Moves, swaps or changes a meal. Moving it puts it after any in its new slot. */
async function change(
  em: EntityManager,
  householdId: string,
  entry: PlanEntry,
  changes: EntryChanges
) {
  const date = changes.date ?? entry.date
  if (changes.date !== undefined) checkDay(changes.date, "date")
  const anyDay = changes.anyDay ?? entry.anyDay
  const meal = changes.meal ?? entry.meal
  const slotDate = anyDay
    ? weekStartOf(date, (await householdClock(em, householdId)).weekStartsOn)
    : date
  if (
    slotDate !== entry.date ||
    anyDay !== entry.anyDay ||
    meal !== entry.meal
  ) {
    entry.position = await nextPosition(em, { date: slotDate, meal, anyDay })
    entry.date = slotDate
    entry.anyDay = anyDay
    entry.meal = meal
  }

  if (changes.recipe !== undefined) {
    const recipe = changes.recipe
      ? await recipeFor(em, changes.recipe, "recipe")
      : null
    if (recipe && recipe.id !== entry.recipe?.id) {
      // Something else: a new meal to shop for and cook, its side kept.
      entry.recipe = em.getReference(Recipe, recipe.id, { wrapped: true })
      entry.note = null
      setStatus(entry, "planned")
      entry.why = changes.why?.length ? changes.why : null
    } else if (!recipe) {
      entry.recipe = null
      entry.withRecipe = null
      entry.variants = null
    }
  }
  if (changes.note !== undefined) {
    entry.note = changes.note?.trim() || null
    if (entry.note) {
      entry.recipe = null
      entry.withRecipe = null
      entry.why = null
    }
  }
  if (changes.withRecipe !== undefined) {
    entry.withRecipe = changes.withRecipe
      ? em.getReference(
          Recipe,
          (await recipeFor(em, changes.withRecipe, "withRecipe")).id,
          { wrapped: true }
        )
      : null
  }
  if (changes.servings !== undefined) entry.servings = changes.servings
  if (changes.status !== undefined) {
    // Only being cooked needs the household's day, to say when.
    const day =
      changes.status === "cooked" && entry.status !== "cooked"
        ? await householdClock(em, householdId)
        : undefined
    setStatus(entry, changes.status, day)
  }
  const recipes = [entry.recipe?.id, entry.withRecipe?.id]
  entry.variants =
    entry.variants?.filter((recipe) => recipes.includes(recipe.recipeId)) ??
    null
  checkShape(entry)
}

export async function updateEntry(
  em: EntityManager,
  householdId: string,
  entryId: string,
  changes: EntryChanges
) {
  const entry = await findEntry(em, entryId)
  const before = snapshotOf(entry)
  const made = madeBy(entry)
  const was = shoppingFor(entry)
  const wasCooked = entry.status === "cooked"
  await change(em, householdId, entry, changes)
  await recordPlanEvents(em, householdId, { before: [before], after: [entry] })
  await em.flush()
  await remade(em, [...made, ...madeBy(entry)])
  await followPlan(em, householdId, [
    { entry, was, now: was ? shoppingFor(entry) : null },
  ])
  await followCooking(em, householdId, [
    { entry, was: wasCooked, now: entry.status === "cooked" },
  ])
  return describeEntry(await findEntry(em.fork(), entry.id))
}

/**
 * Takes a meal off the plan, and the list; a cooked one puts back what it
 * used. Says what it was, to put it back.
 */
export async function removeEntry(
  em: EntityManager,
  householdId: string,
  entryId: string
) {
  const entry = await findEntry(em, entryId)
  const before = snapshotOf(entry)
  const made = madeBy(entry)
  await followPlan(em, householdId, [
    { entry, was: shoppingFor(entry), now: null },
  ])
  await followCooking(em, householdId, [
    { entry, was: entry.status === "cooked", now: false },
  ])
  em.remove(entry)
  await recordPlanEvents(em, householdId, { before: [before], after: [] })
  await em.flush()
  await remade(em, made)
  return before
}

export type BulkAction =
  | { action: "remove" }
  | { action: "move"; date: string; meal?: Meal; anyDay?: boolean }
  | { action: "status"; status: PlanStatus }
  | { action: "swap" }
  | { action: "order" }

type Place = Pick<PlanEntry, "date" | "meal" | "anyDay" | "position">

const placeOf = (entry: PlanEntry): Place => ({
  date: entry.date,
  meal: entry.meal,
  anyDay: entry.anyDay,
  position: entry.position,
})

const samePlace = (a: Place, b: Place) =>
  a.date === b.date && a.meal === b.meal && a.anyDay === b.anyDay

/**
 * Where a swapped meal goes: the other's exact place on a day. Into the
 * week's pool it keeps its own meal, as a move there does, and goes after
 * the pool's others of that meal unless it takes the other's place in it.
 */
async function swappedPlace(
  em: EntityManager,
  entry: PlanEntry,
  other: Place
): Promise<Place> {
  if (!other.anyDay || other.meal === entry.meal) return other
  const slot = { date: other.date, meal: entry.meal, anyDay: true }
  return { ...slot, position: await nextPosition(em, slot) }
}

/** Two meals trade places, keeping everything else. Both or neither. */
async function swapPlaces(em: EntityManager, entries: PlanEntry[]) {
  const [a, b] = entries
  const valid =
    entries.length === 2 &&
    a !== undefined &&
    b !== undefined &&
    !samePlace(a, b) &&
    !(a.anyDay && b.anyDay)
  if (!valid) {
    throw new AppError(
      "invalid",
      "bad_swap",
      "Swap needs two meals in different places."
    )
  }
  const aGoesTo = await swappedPlace(em, a, placeOf(b))
  const bGoesTo = await swappedPlace(em, b, placeOf(a))
  moveTo(a, aGoesTo)
  moveTo(b, bGoesTo)
}

/**
 * One meal's dishes in their new order: the named ones as given, then the
 * rest as they were, so a dish someone just added never fails a reorder.
 * All of them, so Undo puts every one back.
 */
async function dishesInOrder(
  em: EntityManager,
  ids: readonly string[],
  named: PlanEntry[]
) {
  const [first] = named
  if (!first || !named.every((entry) => samePlace(entry, first))) {
    throw new AppError(
      "invalid",
      "bad_order",
      "Put dishes in order one meal at a time."
    )
  }
  const meal = await em.find(
    PlanEntry,
    { date: first.date, meal: first.meal, anyDay: first.anyDay },
    { orderBy: { position: "asc" }, populate: POPULATE, ...WITH_DELETED }
  )
  const byId = new Map(named.map((entry) => [entry.id, entry]))
  const inOrder = [...new Set(ids)].flatMap((id) => byId.get(id) ?? [])
  const rest = meal.filter((entry) => shown(entry) && !byId.has(entry.id))
  return [...inOrder, ...rest]
}

function moveTo(entry: PlanEntry, place: Place) {
  entry.date = place.date
  entry.meal = place.meal
  entry.anyDay = place.anyDay
  entry.position = place.position
}

/**
 * Several meals at once, all or nothing. Says what they were before, so
 * Undo can put them back as they were.
 */
export async function bulkPlan(
  em: EntityManager,
  householdId: string,
  ids: readonly string[],
  action: BulkAction
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const found = await tx.find(
      PlanEntry,
      { id: { $in: ids.filter((id) => UUID.test(id)) } },
      { populate: POPULATE, ...WITH_DELETED }
    )
    const entries =
      action.action === "order"
        ? await dishesInOrder(tx, ids, found.filter(shown))
        : sortEntries(found.filter(shown))
    const before = entries.map(snapshotOf)
    const made = entries.flatMap(madeBy)
    const was = new Map(entries.map((entry) => [entry, shoppingFor(entry)]))
    const wasCooked = new Set(
      entries.filter((entry) => entry.status === "cooked")
    )
    if (action.action === "remove") {
      await followPlan(
        tx,
        householdId,
        entries.map((entry) => ({ entry, was: was.get(entry)!, now: null }))
      )
      await followCooking(
        tx,
        householdId,
        entries.map((entry) => ({
          entry,
          was: wasCooked.has(entry),
          now: false,
        }))
      )
    }
    if (action.action === "swap") await swapPlaces(tx, entries)
    if (action.action === "order") {
      entries.forEach((entry, position) => {
        entry.position = position
      })
    }
    const oneByOne = action.action !== "swap" && action.action !== "order"
    for (const entry of oneByOne ? entries : []) {
      if (action.action === "remove") tx.remove(entry)
      else if (action.action === "move") {
        await change(tx, householdId, entry, {
          date: action.date,
          ...(action.meal ? { meal: action.meal } : {}),
          anyDay: action.anyDay ?? false,
        })
        // Each after the one moved before it.
        await tx.flush()
      } else if (action.action === "status") {
        await change(tx, householdId, entry, { status: action.status })
      }
    }
    await tx.flush()
    if (action.action !== "remove") made.push(...entries.flatMap(madeBy))
    await remade(tx, made)
    if (action.action !== "remove") {
      await followPlan(
        tx,
        householdId,
        entries.map((entry) => ({
          entry,
          was: was.get(entry)!,
          now: was.get(entry) ? shoppingFor(entry) : null,
        }))
      )
      await followCooking(
        tx,
        householdId,
        entries.map((entry) => ({
          entry,
          was: wasCooked.has(entry),
          now: entry.status === "cooked",
        }))
      )
    }
    await recordPlanEvents(tx, householdId, {
      before,
      after: action.action === "remove" ? [] : entries,
    })
    return {
      entries:
        action.action === "remove"
          ? []
          : entries.map((entry) => describeEntry(entry)),
      before,
    }
  })
}

/** When a meal put back cooked was cooked: as it says, never after now. */
function cookedWhen(snapshot: EntrySnapshot, entry: PlanEntry, now: Date) {
  if (snapshot.status !== "cooked") return null
  const said = snapshot.cookedAt ? new Date(snapshot.cookedAt) : entry.cookedAt
  return said && said < now ? said : now
}

/**
 * Puts meals back as they were: ones taken off come back with the same id,
 * ones changed go back to how they were, and the list with them.
 */
export async function restoreEntries(
  em: EntityManager,
  householdId: string,
  snapshots: readonly EntrySnapshot[]
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const recipeIds = [
      ...new Set(
        snapshots.flatMap((snapshot) =>
          [snapshot.recipe, snapshot.withRecipe].filter(
            (id): id is string => id !== null
          )
        )
      ),
    ]
    const recipes = new Map(
      (await tx.find(Recipe, { id: { $in: recipeIds } }, WITH_DELETED)).map(
        (recipe) => [recipe.id, recipe]
      )
    )
    const restored: PlanEntry[] = []
    // The meals as they were before they were put back, for the ones that
    // were still there.
    const before: EntrySnapshot[] = []
    const made: string[] = []
    const listing: {
      entry: PlanEntry
      was: string | null
      now: string | null
    }[] = []
    const cooking: { entry: PlanEntry; was: boolean; now: boolean }[] = []
    const now = new Date()
    for (const snapshot of snapshots) {
      if (!UUID.test(snapshot.id) || !isDay(snapshot.date)) continue
      const recipe = snapshot.recipe ? recipes.get(snapshot.recipe) : null
      if (snapshot.recipe && !recipe) continue
      let entry = await tx.findOne(PlanEntry, { id: snapshot.id })
      const was = entry ? shoppingFor(entry) : null
      const wasCooked = entry?.status === "cooked"
      if (entry) {
        before.push(snapshotOf(entry))
        made.push(...madeBy(entry))
      } else {
        // An id another household has can't come back here.
        const elsewhere = await tx.count(
          PlanEntry,
          { id: snapshot.id },
          { filters: { [HOUSEHOLD_FILTER]: false } }
        )
        if (elsewhere > 0) continue
        entry = tx.create(PlanEntry, {
          id: snapshot.id,
          household: householdId,
          date: snapshot.date,
          meal: snapshot.meal,
        })
      }
      tx.assign(entry, {
        date: snapshot.date,
        anyDay: snapshot.anyDay,
        meal: snapshot.meal,
        position: snapshot.position,
        status: snapshot.status,
        recipe: recipe ?? null,
        withRecipe: snapshot.withRecipe
          ? (recipes.get(snapshot.withRecipe) ?? null)
          : null,
        note: snapshot.note,
        servings: snapshot.servings,
        listedAt: snapshot.listedAt ? new Date(snapshot.listedAt) : null,
        why: snapshot.why ?? null,
        cookedAt: cookedWhen(snapshot, entry, now),
        variants: snapshot.variants ?? entry.variants ?? null,
      })
      made.push(...madeBy(entry))
      listing.push({ entry, was, now: shoppingFor(entry) })
      cooking.push({ entry, was: wasCooked, now: entry.status === "cooked" })
      restored.push(entry)
    }
    await tx.flush()
    await remade(tx, made)
    await followPlan(tx, householdId, listing)
    await followCooking(tx, householdId, cooking)
    await recordPlanEvents(tx, householdId, {
      before,
      after: restored,
      undo: true,
    })
    return sortEntries(restored).map(describeEntry)
  })
}

/**
 * Last week's meals, again: each on the same weekday and meal where that
 * slot is still empty, and the pool's into the pool. Skipped ones stay
 * behind. Copies start as planned.
 */
export async function repeatLastWeek(
  em: EntityManager,
  householdId: string,
  weekStart: string
) {
  checkDay(weekStart, "week")
  const last = addDays(weekStart, -7)
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const [before, now] = await Promise.all([
      tx.find(
        PlanEntry,
        { date: { $gte: last, $lte: addDays(last, 6) } },
        { populate: POPULATE, ...WITH_DELETED }
      ),
      tx.find(PlanEntry, {
        date: { $gte: weekStart, $lte: addDays(weekStart, 6) },
      }),
    ])
    const taken = new Set(
      now
        .filter((entry) => !entry.anyDay)
        .map((entry) => `${entry.date} ${entry.meal}`)
    )
    const inPool = new Set(
      now
        .filter((entry) => entry.anyDay)
        .map((entry) => entry.recipe?.id ?? `note ${entry.note}`)
    )
    const added: PlanEntry[] = []
    for (const entry of sortEntries(before.filter(shown))) {
      if (entry.status === "skipped") continue
      if (entry.anyDay) {
        if (inPool.has(entry.recipe?.id ?? `note ${entry.note}`)) continue
      } else if (taken.has(`${addDays(entry.date, 7)} ${entry.meal}`)) {
        continue
      }
      added.push(
        tx.create(PlanEntry, {
          household: householdId,
          date: entry.anyDay ? weekStart : addDays(entry.date, 7),
          anyDay: entry.anyDay,
          meal: entry.meal,
          position: entry.position,
          recipe: entry.recipe,
          withRecipe: entry.withRecipe?.getEntity()?.deletedAt
            ? null
            : entry.withRecipe,
          note: entry.note,
          servings: entry.servings,
          status: "planned",
        })
      )
    }
    await tx.flush()
    await recordPlanEvents(tx, householdId, { before: [], after: added })
    return sortEntries(added).map(describeEntry)
  })
}

/**
 * Clears what's still planned for the rest of the week (from today in this
 * week, all of it in another), and its pool. Cooked and skipped meals stay.
 * Says what went, to put it back.
 */
export async function clearRest(
  em: EntityManager,
  householdId: string,
  weekStart: string
) {
  checkDay(weekStart, "week")
  const { today } = await householdClock(em, householdId)
  const end = addDays(weekStart, 6)
  const from = today >= weekStart && today <= end ? today : weekStart
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const entries = (
      await tx.find(
        PlanEntry,
        {
          status: "planned",
          $or: [
            { anyDay: false, date: { $gte: from, $lte: end } },
            { anyDay: true, date: weekStart },
          ],
        },
        { populate: POPULATE, ...WITH_DELETED }
      )
    ).filter(shown)
    const before = sortEntries(entries).map(snapshotOf)
    await followPlan(
      tx,
      householdId,
      entries.map((entry) => ({ entry, was: shoppingFor(entry), now: null }))
    )
    tx.remove(entries)
    await tx.flush()
    await recordPlanEvents(tx, householdId, { before, after: [] })
    return before
  })
}

/** What's next: the next meal still planned, by the household's clock. */
export async function whatsNext(em: EntityManager, householdId: string) {
  const clock = await householdClock(em, householdId)
  const entries = await em.find(
    PlanEntry,
    {
      status: "planned",
      anyDay: false,
      date: { $gte: clock.today, $lte: addDays(clock.today, NEXT_DAYS) },
    },
    { populate: POPULATE, ...WITH_DELETED }
  )
  const next = nextMeal(entries.filter(shown), clock)
  return {
    today: clock.today,
    mealNow: mealOfTheHour(clock.hour),
    entry: next ? describeEntry(next) : null,
  }
}

/**
 * How long a meal nobody marked is asked about: as long as the pantry
 * keeps its food set aside.
 */
const ASK_DAYS = 6

/**
 * Did you make these? Recipe meals still planned from the past six days,
 * and the pool of a week that ended in that time, oldest first. Note
 * meals take nothing from the pantry, so they aren't asked about.
 */
export async function toAsk(em: EntityManager, householdId: string) {
  const { today } = await householdClock(em, householdId)
  const entries = await em.find(
    PlanEntry,
    {
      status: "planned",
      recipe: { $ne: null },
      $or: [
        {
          anyDay: false,
          date: { $gte: addDays(today, -ASK_DAYS), $lt: today },
        },
        // A pool is dated to its week's first day, and its week is over
        // seven days on.
        {
          anyDay: true,
          date: {
            $gte: addDays(today, -ASK_DAYS - 6),
            $lte: addDays(today, -7),
          },
        },
      ],
    },
    { populate: POPULATE, ...WITH_DELETED }
  )
  return sortEntries(entries.filter(shown)).map(describeEntry)
}

/**
 * Made it, from the recipe or the cook view. A meal of it already cooked
 * today counts, so pressing it twice doesn't cook it twice. Otherwise
 * today's planned meals of it are cooked; failing those, one in this
 * week's pool becomes today's, cooked; failing that, one's added to today,
 * cooked. So it takes from the pantry like any cooked meal, and marking it
 * not cooked puts that back. `servings`, when given, is how many it made.
 * Says which meal it was.
 */
export function cookToday(
  em: EntityManager,
  householdId: string,
  recipeId: string,
  servings?: number
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    // One at a time: pressed on two phones at once, the second waits here
    // and then finds the first's meal cooked.
    await tx.findOneOrFail(
      Household,
      { id: householdId },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    )
    return cookTodayIn(tx, householdId, recipeId, servings)
  })
}

async function cookTodayIn(
  em: EntityManager,
  householdId: string,
  recipeId: string,
  servings?: number
) {
  const clock = await householdClock(em, householdId)
  const onToday = { recipe: recipeId, date: clock.today, anyDay: false }
  const done = await em.findOne(
    PlanEntry,
    { ...onToday, status: "cooked" },
    { orderBy: { cookedAt: "desc" } }
  )
  if (done) return done.id

  const meal = cookingMeal(clock.meals, clock.hour)
  let entries: PlanEntry[] = sortEntries(
    await em.find(
      PlanEntry,
      { ...onToday, status: "planned" },
      { populate: POPULATE }
    )
  )
  // The meals it cooks as they were: none when it adds one.
  let before: EntrySnapshot[] = entries.map(snapshotOf)
  if (entries.length === 0) {
    const pooled = await em.findOne(
      PlanEntry,
      {
        recipe: recipeId,
        anyDay: true,
        status: "planned",
        date: weekStartOf(clock.today, clock.weekStartsOn),
      },
      { populate: POPULATE }
    )
    if (pooled) {
      before = [snapshotOf(pooled)]
      pooled.position = await nextPosition(em, {
        date: clock.today,
        meal,
        anyDay: false,
      })
      pooled.date = clock.today
      pooled.anyDay = false
      pooled.meal = meal
      entries = [pooled]
    }
  }
  if (entries.length === 0) {
    entries = [
      await createEntry(
        em,
        householdId,
        { date: clock.today, meal, recipe: recipeId },
        clock.weekStartsOn
      ),
    ]
  }
  for (const entry of entries) setStatus(entry, "cooked")
  // How many it made is the first meal's: the one it says it was.
  if (servings !== undefined) entries[0]!.servings = servings
  await em.flush()
  await remade(em, entries.flatMap(madeBy))
  await followCooking(
    em,
    householdId,
    entries.map((entry) => ({ entry, was: false, now: true }))
  )
  await recordPlanEvents(em, householdId, { before, after: entries })
  return entries[0]!.id
}

/**
 * The meal something cooked now goes in: the one that fits the time of
 * day, if the household plans it. Otherwise the latest it plans before
 * then, or failing that its first, so the meal shows on Plan, where it
 * can be marked not cooked.
 */
function cookingMeal(meals: readonly Meal[], hour: number): Meal {
  const now = mealOfTheHour(hour)
  if (meals.includes(now)) return now
  const before = meals.filter(
    (meal) => meal !== "snack" && MEALS.indexOf(meal) < MEALS.indexOf(now)
  )
  return before.at(-1) ?? meals.find((meal) => meal !== "snack") ?? meals[0]!
}
