import {
  formatAmount,
  foodKey,
  packagesFor,
  type SaleJudged,
  type StoreProduct as Product,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  ShoppingItem,
  StoreProduct,
  type StoreConnection,
} from "../../../database/entities/index.ts"

/** The food a list item is, as products are kept by. */
export const foodOf = (item: ShoppingItem) => item.foodKey ?? foodKey(item.name)

/** How much of something the list says, as it shows it: "½ cup". */
export function amountOf(item: ShoppingItem) {
  // Doubles can come back as text from some databases.
  const quantity = item.quantity == null ? null : Number(item.quantity)
  return item.amountText ?? formatAmount(quantity, item.unit ?? null)
}

/**
 * What's left to get: just these things (`itemIds`: the ones Send has
 * going to a store), or everything left on every list.
 */
export async function itemsToGet(
  em: EntityManager,
  itemIds?: readonly string[]
) {
  return em.find(
    ShoppingItem,
    { ...(itemIds ? { id: { $in: [...itemIds] } } : {}), checked: false },
    { orderBy: { createdAt: "asc", id: "asc" } }
  )
}

/** Keep sent packs until put-away, including purchases already checked off. */
export async function itemsLeft(em: EntityManager) {
  return em.find(ShoppingItem, {}, { fields: ["id"] })
}

export type BasketLine = {
  itemId: string
  name: string
  amount: string
  product: Product | null
  /** Merran's pick, not one a person chose. */
  suggested: boolean
  packages: number
  /** How many is worked out, not a guess. */
  sure: boolean
  /** Sent last time, so left unticked unless it's ticked again. */
  sent: boolean
  /** How good its sale is, against what it usually costs; null if none. */
  sale: { verdict: SaleJudged["verdict"]; usual: number | null } | null
}

export function lineFor(
  item: ShoppingItem,
  kept: StoreProduct | undefined,
  connection: StoreConnection,
  sales: Map<string, SaleJudged>
): BasketLine {
  const product = kept?.product ?? null
  // Doubles can come back as text from some databases.
  const quantity = item.quantity == null ? null : Number(item.quantity)
  const { packages, sure } = product
    ? packagesFor(
        { quantity, unit: item.unit ?? null },
        product.size,
        foodOf(item)
      )
    : { packages: 1, sure: false }
  return {
    itemId: item.id,
    name: item.name,
    amount: amountOf(item),
    product,
    suggested: Boolean(kept && !kept.chosen),
    packages: connection.lastSent?.items[item.id] ?? packages,
    sure,
    sent: Boolean(connection.lastSent?.items[item.id]),
    sale: (() => {
      const judged = product ? sales.get(product.id) : undefined
      return judged ? { verdict: judged.verdict, usual: judged.usual } : null
    })(),
  }
}
