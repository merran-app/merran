import {
  foodKey,
  formatAmount,
  readAmount,
  readItem,
  type MealShare,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import {
  Aisle,
  Household,
  ITEM_SOURCES,
  PlanEntry,
  ShoppingItem,
  ShoppingList,
  WeeklyItem,
  type PutAwayRecord,
} from "../../database/entities/index.ts"
import { HOUSEHOLD_FILTER, NOT_DELETED_FILTER } from "../../database/scope.ts"
import { householdKeys } from "../foods/aliases.ts"
import { putsAwayWhenChecked } from "../households/households.ts"
import { inHouseholdTransaction } from "../../database/transactions.ts"
import { toNumber } from "../../database/numbers.ts"
import {
  putAwayAlreadyChecked,
  recountPutAway,
  setChecked,
  takeBack,
} from "../pantry/put-away/checking.ts"
import { putAwayContext, putAwayItem } from "../pantry/put-away/put-away.ts"
import { asShown, recordListChange } from "../webhooks/events/list.ts"
import {
  putInAgain,
  recordPantryChange,
  type PantryCounts,
} from "../webhooks/events/pantry.ts"
import {
  aislesOf,
  describeAisle,
  findAisle,
  householdAisles,
  rememberAisle,
} from "./aisles.ts"
import {
  describeList,
  findList,
  householdLists,
  listsOf,
  mainList,
  rememberList,
} from "./lists.ts"
import { relistRestored, unlistRemoved } from "./meals.ts"

// The shopping lists: what to buy, by aisle, on the list for the store
// it's bought at. Things go on from the plan (added up), typed in, or
// every week. Checking something off keeps it until the list is cleared,
// and puts it in the pantry when the household says to.

export type ItemSource = (typeof ITEM_SOURCES)[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The planned meals items are for: their names, by id. */
async function mealNames(em: EntityManager, items: readonly ShoppingItem[]) {
  const ids = [
    ...new Set(
      items.flatMap((item) => (item.forMeals ?? []).map((share) => share.meal))
    ),
  ]
  if (ids.length === 0) return new Map<string, string>()
  const entries = await em.find(
    PlanEntry,
    { id: { $in: ids } },
    {
      populate: ["recipe"],
      filters: { [NOT_DELETED_FILTER]: false },
    }
  )
  return new Map(
    entries.map((entry) => [
      entry.id,
      entry.recipe?.getEntity().name ?? entry.note ?? "",
    ])
  )
}

/** An item as the API shows it. */
function describeItem(item: ShoppingItem, names: Map<string, string>) {
  const quantity = toNumber(item.quantity)
  return {
    id: item.id,
    list: item.list.id,
    name: item.name,
    amount: item.amountText ?? formatAmount(quantity, item.unit ?? null),
    quantity,
    unit: item.unit ?? null,
    amountText: item.amountText ?? null,
    aisle: item.aisle?.id ?? null,
    checked: item.checked,
    source: item.source,
    // Each meal once, though it may have a share from its side too.
    meals: [...new Set((item.forMeals ?? []).map((share) => share.meal))]
      .filter((id) => names.has(id))
      .map((id) => ({ id, name: names.get(id)! })),
    createdAt: item.createdAt.toISOString(),
  }
}

export type DescribedItem = ReturnType<typeof describeItem>

export async function describeItems(
  em: EntityManager,
  items: readonly ShoppingItem[]
) {
  const names = await mealNames(em, items)
  return items.map((item) => describeItem(item, names))
}

/** An item as it was, to put it back as it was (Undo). */
export function itemSnapshot(item: ShoppingItem) {
  return {
    id: item.id,
    list: item.list.id,
    name: item.name,
    foodKey: item.foodKey ?? null,
    quantity: toNumber(item.quantity),
    unit: item.unit ?? null,
    amountText: item.amountText ?? null,
    aisle: item.aisle?.id ?? null,
    checked: item.checked,
    source: item.source,
    forMeals: item.forMeals ?? null,
    putAway: item.putAway ?? null,
    createdAt: item.createdAt.toISOString(),
  }
}

/**
 * Snapshots taken before rows remembered what they put away (a page open
 * since then) have no `putAway`.
 */
export type ItemSnapshot = Omit<ReturnType<typeof itemSnapshot>, "putAway"> & {
  putAway?: PutAwayRecord | null
}

/**
 * The household's lists, the main one first; its aisles in walking order;
 * and everything on the lists, by aisle.
 */
export async function getList(em: EntityManager, householdId: string) {
  const lists = await householdLists(em, householdId)
  const aisles = await householdAisles(em, householdId)
  const items = await em.find(
    ShoppingItem,
    {},
    { orderBy: { createdAt: "asc", id: "asc" } }
  )
  const order = new Map(aisles.map((aisle) => [aisle.id, aisle.position]))
  const last = aisles.length
  const sorted = [...items].sort(
    (a, b) =>
      (order.get(a.aisle?.id ?? "") ?? last) -
      (order.get(b.aisle?.id ?? "") ?? last)
  )
  return {
    lists: lists.map(describeList),
    aisles: aisles.map(describeAisle),
    items: await describeItems(em, sorted),
  }
}

export async function findItem(em: EntityManager, id: string) {
  const item = UUID.test(id) ? await em.findOne(ShoppingItem, { id }) : null
  if (!item) {
    throw new AppError(
      "not_found",
      "list_item_not_found",
      "That isn't on the list."
    )
  }
  return item
}

/**
 * Something typed in: "2 lb ground beef" or "paper towels". It goes on the
 * list given, else where its food goes.
 */
export async function addTyped(
  em: EntityManager,
  householdId: string,
  input: { text: string; aisle?: string | null; list?: string | null }
) {
  const { name, quantity, unit } = readItem(input.text)
  if (!name) {
    throw new AppError("invalid", "invalid_item", "Say what to add.", {
      text: "Say what to add.",
    })
  }
  const item = await typedItem(em, householdId, {
    name,
    quantity,
    unit,
    aisle: input.aisle,
    list: input.list,
  })
  await em.flush()
  return (await describeItems(em, [item]))[0]!
}

/**
 * A line typed in, read already: on the aisle and list given, else where
 * its food goes. It's saved with the next flush.
 */
export async function typedItem(
  em: EntityManager,
  householdId: string,
  input: {
    name: string
    quantity?: number | null
    unit?: string | null
    aisle?: string | null
    list?: string | null
  }
) {
  const keyOf = await householdKeys(em)
  const { name, quantity = null, unit = null } = input
  const aisle = input.aisle
    ? await findAisle(em, input.aisle)
    : (await aislesOf(em, householdId, [{ name, unit }]))[0]!
  const list = input.list
    ? await findList(em, input.list)
    : (await listsOf(em, householdId, [{ name, aisle }]))[0]!
  const item = em.create(ShoppingItem, {
    household: householdId,
    list,
    foodKey: keyOf(name),
    name,
    quantity,
    unit,
    aisle,
    source: "typed",
  })
  // Always a line of its own, never added into one that's there. Told
  // once for each: a proposal's lines, or what ran out, are gathered into
  // one event with the rest.
  await recordListChange(em, householdId, [item], { added: 1 })
  return item
}

export type ItemChanges = Partial<{
  name: string
  /** As typed: "2 lb", "half a bag", or empty for none. */
  amount: string
  checked: boolean
  /** An aisle's id, remembered for the food next time; null for none. */
  aisle: string | null
  /** A list's id, remembered for the food next time. */
  list: string
}>

/** Whether an amount typed in is not what the row says already. */
function amountDiffers(
  typed: ReturnType<typeof readAmount>,
  item: ShoppingItem
) {
  return (
    typed.quantity !== toNumber(item.quantity) ||
    typed.unit !== (item.unit ?? null) ||
    typed.amountText !== (item.amountText ?? null)
  )
}

export async function updateItem(
  em: EntityManager,
  householdId: string,
  id: string,
  changes: ItemChanges
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const keyOf = await householdKeys(tx)
    const item = await findItem(tx, id)
    const shown = asShown(item)
    const from = item.list.id
    // Only a name that's different is a new food. The same name sent again
    // keeps the row's food, which for a row from the plan can be one a
    // person chose rather than its name's.
    const name = changes.name?.trim()
    const nameChanged = name !== undefined && name !== item.name
    // A checked row's name or amount is what's in the pantry, when what's
    // sent is different from what the row says. A new food comes in and the
    // old one goes: out first, while the row still says what it put in.
    // The same food with another amount just changes by the difference.
    const wentIn = item.checked && Boolean(item.putAway)
    const renamed = wentIn && nameChanged
    const recounted =
      wentIn &&
      !renamed &&
      changes.amount !== undefined &&
      amountDiffers(readAmount(changes.amount), item)
    // What a rename or a new amount does to the pantry, told once at the
    // end. Checking it off, or not, is setChecked's to tell.
    let pantry: PantryCounts = {}
    const tookFrom = renamed ? await takeBack(tx, item) : null
    if (nameChanged) {
      item.name = name
      item.foodKey = keyOf(name)
    }
    if (changes.amount !== undefined) {
      tx.assign(item, readAmount(changes.amount))
    }
    if (changes.aisle !== undefined) {
      const aisle = changes.aisle ? await findAisle(tx, changes.aisle) : null
      item.aisle = aisle
        ? tx.getReference(Aisle, aisle.id, { wrapped: true })
        : null
      await rememberAisle(tx, householdId, [item.name], aisle)
    }
    if (changes.list !== undefined) {
      const list = await findList(tx, changes.list)
      item.list = tx.getReference(ShoppingList, list.id, { wrapped: true })
      await rememberList(tx, householdId, [item.name], list)
    }
    // Unless it's being unchecked, which leaves nothing to put in.
    if (renamed && changes.checked !== false) {
      const context = await putAwayContext(tx, householdId)
      item.putAway = await putAwayItem(tx, householdId, item, context)
    }
    if (renamed) {
      // The old food out, and the new one in unless it's being unchecked.
      // Then setChecked finds nothing left to take back, so it's all
      // counted here.
      pantry = putInAgain(tookFrom, item.putAway?.pantryItem ?? null)
    }
    if (recounted && changes.checked !== false) {
      pantry = await recountPutAway(tx, householdId, item)
    }
    // Last, so what goes in the pantry is the row as it's just been changed.
    if (changes.checked !== undefined) {
      await setChecked(tx, householdId, [item], changes.checked)
    }
    await tx.flush()
    // Checking it off is setChecked's to tell; anything else is a change.
    if (asShown(item) !== shown) {
      await recordListChange(
        tx,
        householdId,
        [item],
        { changed: 1 },
        { movedFrom: [from] }
      )
    }
    await recordPantryChange(tx, householdId, pantry)
    return (await describeItems(tx, [item]))[0]!
  })
}

/**
 * Nothing checked comes off the list without going in the pantry, when the
 * household says to: rows checked off before the setting was on, or before
 * put-away kept records, go in now, before what they were is taken for
 * Undo, so Undo brings them back with what they put away. `only` limits
 * it to the rows being taken off.
 */
async function putAwayBeforeTakingOff(
  tx: EntityManager,
  householdId: string,
  only?: readonly ShoppingItem[]
) {
  if (only && !only.some((item) => item.checked && !item.putAway)) return
  const household = await tx.findOneOrFail(Household, { id: householdId })
  if (!putsAwayWhenChecked(household.settings)) return
  await putAwayAlreadyChecked(
    tx,
    householdId,
    only?.map((item) => item.id)
  )
}

export async function removeItem(
  em: EntityManager,
  householdId: string,
  id: string
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const item = await findItem(tx, id)
    await putAwayBeforeTakingOff(tx, householdId, [item])
    const before = itemSnapshot(item)
    tx.remove(item)
    await tx.flush()
    await unlistRemoved(tx, [item])
    await recordListChange(tx, householdId, [item], { removed: 1 })
    return before
  })
}

export type ItemBulk =
  | { action: "remove" | "check" | "uncheck" | "every-week" }
  | { action: "aisle"; aisle: string | null }
  | { action: "move"; list: string }

/**
 * Several items at once, all or none: taken off, checked or not, moved to
 * an aisle or another list (remembered, as moving one is), or bought
 * every week. The answer says what they were before, for Undo. Ids not on
 * the list are passed over.
 */
export async function bulkItems(
  em: EntityManager,
  householdId: string,
  ids: readonly string[],
  bulk: ItemBulk
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const items = await tx.find(ShoppingItem, {
      id: { $in: ids.filter((id) => UUID.test(id)) },
    })
    if (bulk.action === "remove") {
      await putAwayBeforeTakingOff(tx, householdId, items)
    }
    const before = items.map(itemSnapshot)
    const was = items.map((item) => ({
      shown: asShown(item),
      list: item.list.id,
    }))
    switch (bulk.action) {
      case "remove":
        for (const item of items) tx.remove(item)
        await tx.flush()
        await unlistRemoved(tx, items)
        break
      case "check":
      case "uncheck":
        await setChecked(tx, householdId, items, bulk.action === "check")
        break
      case "aisle": {
        const aisle = bulk.aisle ? await findAisle(tx, bulk.aisle) : null
        for (const item of items)
          item.aisle = aisle
            ? tx.getReference(Aisle, aisle.id, { wrapped: true })
            : null
        await rememberAisle(
          tx,
          householdId,
          items.map((item) => item.name),
          aisle
        )
        break
      }
      case "move": {
        const list = await findList(tx, bulk.list)
        for (const item of items)
          item.list = tx.getReference(ShoppingList, list.id, { wrapped: true })
        await rememberList(
          tx,
          householdId,
          items.map((item) => item.name),
          list
        )
        break
      }
      case "every-week":
        await makeEveryWeek(tx, householdId, items)
        break
    }
    await tx.flush()
    await recordBulk(tx, householdId, bulk, items, was)
    return { changed: items.length, before }
  })
}

/**
 * Tells webhooks what a bulk change did to the list: rows taken off, or
 * moved to another aisle or list. Checking is setChecked's to tell, and
 * buying every week changes nothing people see on the list. `was` is each
 * row as it was shown, and its list, in the order of `items`.
 */
async function recordBulk(
  tx: EntityManager,
  householdId: string,
  bulk: ItemBulk,
  items: readonly ShoppingItem[],
  was: readonly { shown: string; list: string }[]
) {
  if (bulk.action === "remove") {
    await recordListChange(tx, householdId, items, { removed: items.length })
    return
  }
  if (bulk.action !== "aisle" && bulk.action !== "move") return

  // Rows already in that aisle, or on that list, weren't moved.
  const moved: ShoppingItem[] = []
  const from: string[] = []
  items.forEach((item, index) => {
    if (asShown(item) === was[index]!.shown) return
    moved.push(item)
    from.push(was[index]!.list)
  })
  await recordListChange(
    tx,
    householdId,
    moved,
    { changed: moved.length },
    { movedFrom: from }
  )
}

/**
 * Items to buy every week from now on. One every-week item a food; typed
 * ones become this week's every-week line, so adding the every-week items
 * doesn't put them on twice.
 */
async function makeEveryWeek(
  em: EntityManager,
  householdId: string,
  items: readonly ShoppingItem[]
) {
  const keyOf = await householdKeys(em)
  const weekly = await em.find(WeeklyItem, {})
  const main = await mainList(em, householdId)
  const have = new Set(weekly.map((item) => keyOf(item.name)))
  let position = Math.max(-1, ...weekly.map((item) => item.position)) + 1
  for (const item of items) {
    const key = keyOf(item.name)
    if (!have.has(key)) {
      have.add(key)
      const amount = describeItem(item, new Map()).amount
      em.create(WeeklyItem, {
        household: householdId,
        name: item.name,
        amountText: amount || null,
        aisle: item.aisle ?? null,
        // Bought where it's bought now, unless that's anywhere.
        list: item.list.id === main.id ? null : item.list,
        position: position++,
      })
    }
    if (item.source === "typed") item.source = "every-week"
  }
}

/** Takes checked items off the list, or everything. Says what they were, for Undo. */
export async function clearList(
  em: EntityManager,
  householdId: string,
  which: "checked" | "all"
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    // Clearing either way takes off everything that's checked.
    await putAwayBeforeTakingOff(tx, householdId)
    const items = await tx.find(
      ShoppingItem,
      which === "checked" ? { checked: true } : {}
    )
    const before = items.map(itemSnapshot)
    for (const item of items) tx.remove(item)
    await tx.flush()
    await unlistRemoved(tx, items)
    // Every list it cleared, told once with the total.
    await recordListChange(tx, householdId, items, { removed: items.length })
    return { before }
  })
}

/**
 * Puts items back as they were (Undo), and takes off ones that weren't
 * there (`remove`, by id). An id another household has can't come back
 * here; an aisle that's gone is left empty, and a list that's gone is the
 * main list.
 */
export async function restoreItems(
  em: EntityManager,
  householdId: string,
  snapshots: readonly ItemSnapshot[],
  remove: readonly string[] = []
) {
  const keyOf = await householdKeys(em)
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const ids = remove.filter((id) => UUID.test(id))
    const removed =
      ids.length > 0 ? await tx.find(ShoppingItem, { id: { $in: ids } }) : []
    for (const item of removed) tx.remove(item)
    const lists = await householdLists(tx, householdId)
    const listOf = (id: string) =>
      lists.find((list) => list.id === id) ?? lists[0]!
    const aisles = new Map(
      (await householdAisles(tx, householdId)).map((aisle) => [aisle.id, aisle])
    )
    const restored: ShoppingItem[] = []
    // For webhooks: rows back on the list, and rows there that were put
    // back as they were, with the lists those were on.
    const back: ShoppingItem[] = []
    const changed: ShoppingItem[] = []
    const movedFrom: string[] = []
    for (const snapshot of snapshots) {
      if (!UUID.test(snapshot.id)) continue
      let item = await tx.findOne(ShoppingItem, { id: snapshot.id })
      const was = item ? { shown: asShown(item), list: item.list.id } : null
      if (!item) {
        const elsewhere = await tx.count(
          ShoppingItem,
          { id: snapshot.id },
          { filters: { [HOUSEHOLD_FILTER]: false } }
        )
        if (elsewhere > 0) continue
        // Back checked or not as it was, with what it put away: that's
        // still in the pantry, so nothing goes in again.
        item = tx.create(ShoppingItem, {
          id: snapshot.id,
          household: householdId,
          list: listOf(snapshot.list),
          name: snapshot.name,
          source: snapshot.source,
          checked: snapshot.checked,
          checkedAt: snapshot.checked ? new Date() : null,
          putAway: snapshot.putAway ?? null,
          createdAt: new Date(snapshot.createdAt),
        })
      }
      const aisle = snapshot.aisle ? aisles.get(snapshot.aisle) : undefined
      tx.assign(item, {
        list: listOf(snapshot.list),
        name: snapshot.name,
        foodKey: snapshot.foodKey ?? keyOf(snapshot.name),
        quantity: snapshot.quantity,
        unit: snapshot.unit,
        amountText: snapshot.amountText,
        aisle: aisle ?? null,
        source: snapshot.source,
        forMeals: snapshot.forMeals as MealShare[] | null,
      })
      if (item.checked !== snapshot.checked) {
        await setChecked(tx, householdId, [item], snapshot.checked, {
          undo: true,
        })
      }
      restored.push(item)
      if (!was) {
        back.push(item)
      } else if (asShown(item) !== was.shown) {
        changed.push(item)
        movedFrom.push(was.list)
      }
    }
    await tx.flush()
    await relistRestored(tx, restored)
    await recordListChange(
      tx,
      householdId,
      [...removed, ...back, ...changed],
      {
        added: back.length,
        changed: changed.length,
        removed: removed.length,
      },
      { movedFrom }
    )
    return describeItems(tx, restored)
  })
}
