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
    } else if (item.putAway) {
      await takeBack(tx, item.putAway)
      item.putAway = null
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
 * Takes back what checking a row off put away: the purchase goes, its
 * meal shares come off, and so does the amount it added. Cooking or Used
 * up may have taken some since, so it takes back what's left and never
 * goes below nothing. If the pantry item's gone, there's nothing to take.
 */
export async function takeBack(
  tx: EntityManager,
  record: PutAwayRecord
): Promise<void> {
  const purchase = await tx.findOne(Purchase, { id: record.purchase })
  if (purchase) tx.remove(purchase)
  if (!record.pantryItem) return
  const item = await tx.findOne(PantryItem, { id: record.pantryItem })
  if (!item) return
  item.forMeals = withoutShares(item, record.forMeals)
  if (record.quantity !== null) {
    if (!measured(item)) return
    const rest = subtractAmounts(amountOf(item), record, item.foodKey)
    // Its amount was changed to one that doesn't convert: leave it.
    if (!rest) return
    if (rest.quantity <= NOTHING) {
      tx.remove(item)
      return
    }
    tx.assign(item, { quantity: rest.quantity, unit: rest.unit })
    return
  }
  // "Have it", or an amount in words: it goes only if this row made it,
  // and its amount is still what this row gave it.
  if (record.created && stillAsPutAway(item, record)) tx.remove(item)
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
