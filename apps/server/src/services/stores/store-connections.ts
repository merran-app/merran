import type { EntityManager } from "@mikro-orm/sql"
import type { AppDeps } from "../../core/context.ts"
import { StoreConnection } from "../../database/entities/index.ts"

export type StoreDeps = Pick<AppDeps, "settings" | "fetcher">

/** The household's connection to a store, made when first needed. */
export async function connectionOf(
  em: EntityManager,
  householdId: string,
  store: string
) {
  return (
    (await em.findOne(StoreConnection, { store })) ??
    em.create(StoreConnection, { household: householdId, store })
  )
}
