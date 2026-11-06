import {
  DEFAULT_ON_HAND,
  guessStorage,
  guessUseBy,
  onHandTest,
  formatAmount,
  sizeAmount,
  type AisleKey,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  Household,
  Purchase,
  ShoppingItem,
  StoreProduct,
  type LastSent,
  type PutAwayRecord,
} from "../../../database/entities/index.ts"
import { householdKeys } from "../../foods/aliases.ts"
import { findList } from "../../list/lists.ts"
import { inHouseholdTransaction } from "../../../database/transactions.ts"
import { toNumber } from "../../../database/numbers.ts"
import { KROGER, krogerConnection } from "../../stores/kroger/connection.ts"
import { householdToday } from "../../households/clock.ts"
import { store } from "../pantry.ts"

/**
 * What putting things away needs to know, read once for however many
 * rows go in: the household's food keys, what's always on hand, today,
 * and what went to the Kroger cart and in what packs.
 */
export type PutAwayContext = {
  keyOf: (name: string) => string
  isOnHand: (name: string) => boolean
  today: string
  lastSent: LastSent | null
  packs: Map<string, StoreProduct["product"]>
}

export async function putAwayContext(
  tx: EntityManager,
  householdId: string
): Promise<PutAwayContext> {
  const household = await tx.findOneOrFail(Household, { id: householdId })
  const lastSent = (await krogerConnection(tx))?.lastSent ?? null
  const packs = new Map(
    (await tx.find(StoreProduct, { store: KROGER })).map((row) => [
      row.food,
      row.product,
    ])
  )
  return {
    keyOf: await householdKeys(tx),
    isOnHand: onHandTest(household.settings?.alwaysOnHand ?? DEFAULT_ON_HAND),
    today: await householdToday(tx, householdId),
    lastSent,
    packs,
  }
}

/**
 * Puts one row from the list away: it goes in the purchase history, then
 * in the pantry, set aside for the meals it was bought for, in the
 * fridge, freezer or cupboard with a use-by guess for fresh food. What was
 * sent to the Kroger cart goes in as the packs bought, so the rest of a
 * 1 lb pack after the ½ lb the meals need is there to use. Household
 * things and what's always on hand are bought but not stored. Says what
 * it did, so it can be taken back out. The row itself stays.
 */
export async function putAwayItem(
  tx: EntityManager,
  householdId: string,
  item: ShoppingItem,
  context: PutAwayContext
): Promise<PutAwayRecord> {
  // Checking one row off loads it without its aisle.
  await tx.populate(item, ["aisle"])
  const detail = context.lastSent?.details?.[item.id]
  const amount =
    item.amountText ?? formatAmount(toNumber(item.quantity), item.unit ?? null)
  // An explicit correction after sending describes what actually arrived.
  const corrected =
    detail && (detail.name !== item.name || detail.amount !== amount)
  const bought = boughtAmount(
    item,
    corrected ? undefined : context.lastSent?.items[item.id],
    context.packs,
    detail?.size
  )
  const purchase = tx.create(Purchase, {
    household: householdId,
    foodKey: item.foodKey ?? context.keyOf(item.name),
    name: item.name,
    quantity: bought.quantity,
    unit: bought.unit,
    amountText: item.amountText ?? null,
    boughtOn: context.today,
  })
  const aisle = item.aisle?.getEntity() ?? null
  const key = (aisle?.key as AisleKey | null | undefined) ?? null
  let stored: Awaited<ReturnType<typeof store>> | null = null
  if (key !== "household" && !context.isOnHand(item.name)) {
    const storedIn = guessStorage(item.name, key)
    stored = await store(tx, householdId, {
      name: item.name,
      quantity: bought.quantity,
      unit: bought.unit,
      amountText: item.amountText ?? null,
      aisle,
      storedIn,
      useBy: guessUseBy(item.name, key, storedIn, context.today),
      forMeals: item.forMeals ?? [],
    })
  }
  // Ids are made on flush; and so the next of the same food joins it.
  await tx.flush()
  return {
    pantryItem: stored?.item.id ?? null,
    quantity: bought.quantity,
    unit: bought.unit,
    amountText: item.amountText ?? null,
    created: stored?.created ?? false,
    filledEmpty: stored?.filledEmpty ?? false,
    forMeals: item.forMeals ?? [],
    purchase: purchase.id,
    lookedOverAt: null,
  }
}

/**
 * Done shopping: what's checked off on a list (or all of them) is put
 * away and comes off the list. Rows that went in when they were checked
 * off just come off. Says how many went in the pantry, and how many were
 * only cleared.
 */
export async function putAway(
  em: EntityManager,
  householdId: string,
  { list }: { list?: string | null } = {}
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const from = list ? await findList(tx, list) : null
    const checked = await tx.find(
      ShoppingItem,
      from ? { checked: true, list: from.id } : { checked: true },
      { populate: ["aisle"], orderBy: { createdAt: "asc" } }
    )
    const context = await putAwayContext(tx, householdId)
    let stored = 0
    for (const item of checked) {
      // Checking it off put it away already.
      if (item.putAway) continue
      const record = await putAwayItem(tx, householdId, item, context)
      if (record.pantryItem) stored++
    }
    for (const item of checked) tx.remove(item)
    await tx.flush()
    return { stored, cleared: checked.length - stored }
  })
}

/**
 * How much of something was bought: the packs sent to the Kroger cart
 * (2 packs of 1 lb is 2 lb), else what the list said.
 */
function boughtAmount(
  item: ShoppingItem,
  packages: number | undefined,
  packs: Map<string, StoreProduct["product"]>,
  sentSize?: string | null
) {
  const listed = { quantity: toNumber(item.quantity), unit: item.unit ?? null }
  if (!packages || item.amountText || !item.foodKey) return listed
  const pack = sizeAmount(
    sentSize === undefined ? packs.get(item.foodKey)?.size : sentSize
  )
  if (!pack?.quantity) return listed
  return { quantity: pack.quantity * packages, unit: pack.unit }
}
