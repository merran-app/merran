import { subtractAmounts, type MealShare } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  Household,
  PantryItem,
  Purchase,
  ShoppingItem,
  type PutAwayRecord,
  type SetAside,
} from "../../../database/entities/index.ts"
import { householdKeys } from "../../foods/aliases.ts"
import { putsAwayWhenChecked } from "../../households/households.ts"
import { amountOf, measured } from "../pantry.ts"
import { putAwayContext, putAwayItem, type PutAwayContext } from "./put-away.ts"

// Checking a row off the list goes through here, however it's done: one
// row, a selection, Undo, or marking what was sent to the cart bought.
// Checking puts the row in the pantry in the same transaction, and
// unchecking takes exactly that back out, so the two never drift apart.

/** Amounts are rounded, so this little is nothing left. */
const NOTHING = 0.001

/**
 * Checks rows off, or not. Each row's change is claimed in the database
 * first, so two phones checking the same row at once put it away once.
 * Checking puts a row away when the household says to; unchecking takes
 * back what it put away, whatever the household says now.
 */
export async function setChecked(
  tx: EntityManager,
  householdId: string,
  items: readonly ShoppingItem[],
  checked: boolean
): Promise<void> {
  const putAway = puttingAway(tx, householdId)
  for (const item of items) {
    const claimed = await claim(tx, item, checked)
    if (!claimed) continue
    if (checked) {
      await putAway(item)
    } else {
      await takeBack(tx, item)
    }
  }
}

/**
 * Changes whether a row is checked in the database, unless it's that
 * already: here, or on another phone a moment ago. Says whether it
 * changed it, and keeps the row loaded here the same.
 */
async function claim(tx: EntityManager, item: ShoppingItem, checked: boolean) {
  const checkedAt = checked ? new Date() : null
  const changed = await tx.nativeUpdate(
    ShoppingItem,
    { id: item.id, checked: !checked },
    { checked, checkedAt }
  )
  if (changed === 0) return false
  item.checked = checked
  item.checkedAt = checkedAt
  return true
}

/**
 * Puts checked rows away, when the household says to. The setting, and
 * what putting away needs to know, are read for the first row only.
 */
function puttingAway(tx: EntityManager, householdId: string) {
  let putsAway: boolean | undefined
  let context: PutAwayContext | undefined
  return async (item: ShoppingItem) => {
    // Never twice.
    if (item.putAway) return
    if (putsAway === undefined) {
      const household = await tx.findOneOrFail(Household, { id: householdId })
      putsAway = putsAwayWhenChecked(household.settings)
    }
    if (!putsAway) return
    context ??= await putAwayContext(tx, householdId)
    item.putAway = await putAwayItem(tx, householdId, item, context)
  }
}

/**
 * Takes back what checking a row off put away, and forgets it: the
 * purchase goes, its meal shares come off, and so does the amount it
 * added. Cooking or Used up may have taken some since, so it takes back
 * what's left and never goes below nothing. If the pantry item's gone,
 * there's nothing to take. Undo sends what a row put away back from the
 * page, so a purchase or pantry item of another food is left alone.
 */
export async function takeBack(
  tx: EntityManager,
  row: ShoppingItem
): Promise<void> {
  const record = row.putAway
  if (!record) return
  row.putAway = null
  const isRowsFood = await foodTest(tx, row)
  const purchase = await tx.findOne(Purchase, { id: record.purchase })
  if (purchase && isRowsFood(purchase.foodKey)) tx.remove(purchase)
  if (!record.pantryItem) return
  const item = await tx.findOne(PantryItem, { id: record.pantryItem })
  if (!item || !isRowsFood(item.foodKey)) return
  item.forMeals = withoutShares(item, record.forMeals)
  if (record.quantity !== null) {
    takeBackAmount(tx, item, record)
  } else {
    takeBackWords(tx, item, record)
  }
}

/**
 * Whether a food key is a row's food: its own key, which its purchase is
 * kept under, or its name's, which the pantry keeps it under. The two
 * differ for some rows from the plan.
 */
async function foodTest(tx: EntityManager, row: ShoppingItem) {
  const keyOf = await householdKeys(tx)
  const keys = new Set([keyOf(row.name)])
  if (row.foodKey) keys.add(row.foodKey)
  return (key: string) => keys.has(key)
}

/**
 * Takes an amount back off a pantry item. When that's all of it, the item
 * goes, unless it was there with no amount before the row gave it one:
 * then it has none again.
 */
function takeBackAmount(
  tx: EntityManager,
  item: PantryItem,
  record: PutAwayRecord
) {
  if (!measured(item)) return
  const rest = subtractAmounts(amountOf(item), record, item.foodKey)
  // Its amount was changed to one that doesn't convert: leave it.
  if (!rest) return
  if (rest.quantity > NOTHING) {
    tx.assign(item, { quantity: rest.quantity, unit: rest.unit })
  } else if (record.filledEmpty) {
    tx.assign(item, { quantity: null, unit: null })
  } else {
    tx.remove(item)
  }
}

/**
 * "Have it", or an amount in words, comes back out only while the pantry
 * item still says what the row gave it: the item goes if the row made it,
 * and has no amount again if it had none before.
 */
function takeBackWords(
  tx: EntityManager,
  item: PantryItem,
  record: PutAwayRecord
) {
  if (!stillAsPutAway(item, record)) return
  if (record.created) {
    tx.remove(item)
  } else if (record.filledEmpty) {
    tx.assign(item, { amountText: null })
  }
}

/**
 * An item's meal shares, less the ones a row brought: each comes off the
 * same meal's share, which goes when nothing's left of it or it can't be
 * taken off.
 */
function withoutShares(item: PantryItem, brought: readonly MealShare[]) {
  const shares: SetAside[] = [...(item.forMeals ?? [])]
  for (const share of brought) {
    const index = shares.findIndex((mine) => mine.meal === share.meal)
    if (index === -1) continue
    const mine = shares[index]!
    const rest = subtractAmounts(mine, share, item.foodKey)
    if (!rest || rest.quantity <= NOTHING) {
      shares.splice(index, 1)
      continue
    }
    shares[index] = { ...mine, quantity: rest.quantity, unit: rest.unit }
  }
  return shares.length > 0 ? shares : null
}

/** No number, and the same words as the row put in (or none). */
function stillAsPutAway(item: PantryItem, record: PutAwayRecord) {
  return (
    amountOf(item).quantity === null &&
    (item.amountText ?? null) === record.amountText
  )
}
