import type { StoreProduct as Product } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { StorePrice } from "../../../database/entities/index.ts"
import { householdToday } from "../../households/clock.ts"

/** Keeps the prices seen today, the latest of the day winning. */
export async function recordPrices(
  em: EntityManager,
  householdId: string,
  products: readonly Product[],
  store: string
) {
  if (products.length === 0) return
  const day = await householdToday(em, householdId)
  const kept = new Map(
    (
      await em.find(StorePrice, {
        store,
        day,
        productId: { $in: products.map((product) => product.id) },
      })
    ).map((row) => [row.productId, row])
  )
  for (const product of products) {
    const row =
      kept.get(product.id) ??
      em.create(StorePrice, {
        household: householdId,
        store,
        productId: product.id,
        day,
        currency: product.currency,
      })
    row.price = product.price
    row.salePrice = product.salePrice
    row.saleEnds = product.saleEnds
    kept.set(product.id, row)
  }
  await em.flush()
}
