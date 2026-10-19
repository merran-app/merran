import {
  DEFAULT_ON_HAND,
  guessStorage,
  guessUseBy,
  onHandTest,
  foodKey,
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
} from "../../database/entities/index.ts"
import { householdKeys } from "../foods/aliases.ts"
import { findList } from "../list/lists.ts"
import { inHouseholdTransaction } from "../../database/transactions.ts"
import { toNumber } from "../../database/numbers.ts"
import { KROGER, krogerConnection } from "../stores/kroger/connection.ts"
import { householdToday } from "../households/clock.ts"
import { store } from "./pantry.ts"

/**
 * Done shopping: what's checked off on a list (or all of them) goes in the
 * pantry, set aside for the meals it was bought for, in the fridge, freezer
 * or cupboard with a use-by guess for fresh food. What was sent to the
 * Kroger cart goes in as the packs bought, so the rest of a 1 lb pack
 * after the ½ lb the meals need is there to use. Household things and
 * what's always on hand are cleared without going in. Everything bought
 * goes in the purchase history, for usual buys.
 */
export async function putAway(
  em: EntityManager,
  householdId: string,
  { list }: { list?: string | null } = {}
) {
  const keyOf = await householdKeys(em)
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const household = await tx.findOneOrFail(Household, { id: householdId })
    const isOnHand = onHandTest(
      household.settings?.alwaysOnHand ?? DEFAULT_ON_HAND
    )
    const from = list ? await findList(tx, list) : null
    const checked = await tx.find(
      ShoppingItem,
      from ? { checked: true, list: from.id } : { checked: true },
      { populate: ["aisle"], orderBy: { createdAt: "asc" } }
    )
    const today = await householdToday(tx, householdId)
    // What went to the Kroger cart, and in what packs.
    const lastSent = (await krogerConnection(tx))?.lastSent
    const sent = lastSent?.items ?? {}
    const packs = new Map(
      (await tx.find(StoreProduct, { store: KROGER })).map((row) => [
        row.food,
        row.product,
      ])
    )
    let stored = 0
    for (const item of checked) {
      const detail = lastSent?.details?.[item.id]
      const amount =
        item.amountText ??
        formatAmount(toNumber(item.quantity), item.unit ?? null)
      // An explicit correction after sending describes what actually arrived.
      const corrected =
        detail && (detail.name !== item.name || detail.amount !== amount)
      const bought = boughtAmount(
        item,
        corrected ? undefined : sent[item.id],
        packs,
        detail?.size
      )
      const quantity = bought.quantity
      tx.create(Purchase, {
        household: householdId,
        foodKey: item.foodKey ?? keyOf(item.name),
        name: item.name,
        quantity,
        unit: bought.unit,
        amountText: item.amountText ?? null,
        boughtOn: today,
      })
      const aisle = item.aisle?.getEntity() ?? null
      const key = (aisle?.key as AisleKey | null | undefined) ?? null
      tx.remove(item)
      if (key === "household" || isOnHand(item.name)) continue
      const storedIn = guessStorage(item.name, key)
      await store(tx, householdId, {
        name: item.name,
        quantity,
        unit: bought.unit,
        amountText: item.amountText ?? null,
        aisle,
        storedIn,
        useBy: guessUseBy(item.name, key, storedIn, today),
        forMeals: item.forMeals ?? [],
      })
      // So the next of the same food joins it.
      await tx.flush()
      stored++
    }
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
