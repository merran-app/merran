import type {
  ShoppingItem,
  StoreProduct,
} from "../../database/entities/index.ts"
import type { LastSent } from "../../database/entities/store_connections.ts"

/** Keep the original purchase visible even when the list or product changes. */
export function sentDetails(
  item: ShoppingItem,
  product: StoreProduct["product"],
  amount: string | null
): NonNullable<LastSent["details"]>[string] {
  return {
    name: item.name,
    amount,
    productId: product.id,
    product: product.name,
    size: product.size,
    at: new Date().toISOString(),
  }
}
