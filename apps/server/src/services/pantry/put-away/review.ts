import type { EntityManager } from "@mikro-orm/sql"
import { ShoppingItem } from "../../../database/entities/index.ts"
import { inHouseholdTransaction } from "../../../database/transactions.ts"
import { findList } from "../../list/lists.ts"
import { getPantry, type PantryItemView } from "../pantry.ts"

// What went in when the shopping was checked off, for the "Where did it
// all go?" drawer: people look it over, move things, or freeze some, then
// say it looks right.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * What checked-off rows put in the pantry that hasn't been looked over:
 * the rows (to say they were looked over), and the pantry items they went
 * into, each once and in the pantry's order. Rows whose pantry item has
 * gone since, and rows that put nothing in, are left out.
 */
export async function toLookOver(
  em: EntityManager,
  householdId: string,
  options: { list?: string | null }
): Promise<{ rows: string[]; items: PantryItemView[] }> {
  const from = options.list ? await findList(em, options.list) : null
  const checked = await em.find(
    ShoppingItem,
    from ? { checked: true, list: from.id } : { checked: true },
    { orderBy: { createdAt: "asc" } }
  )
  const { items: pantry } = await getPantry(em, householdId)
  const there = new Set(pantry.map((item) => item.id))
  const unseen = checked.filter((row) => {
    const record = row.putAway
    if (!record || record.lookedOverAt) return false
    return record.pantryItem !== null && there.has(record.pantryItem)
  })
  const wanted = new Set(unseen.map((row) => row.putAway!.pantryItem))
  return {
    rows: unseen.map((row) => row.id),
    items: pantry.filter((item) => wanted.has(item.id)),
  }
}

/**
 * Says these rows' food was looked over. Rows that aren't this
 * household's, put nothing away, or were looked over already are passed
 * over. Says how many changed.
 */
export async function lookedOver(
  em: EntityManager,
  householdId: string,
  rows: readonly string[]
): Promise<{ changed: number }> {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const found = await tx.find(ShoppingItem, {
      id: { $in: rows.filter((id) => UUID.test(id)) },
    })
    const now = new Date().toISOString()
    let changed = 0
    for (const row of found) {
      if (!row.putAway || row.putAway.lookedOverAt) continue
      // A new object, so the change is seen.
      row.putAway = { ...row.putAway, lookedOverAt: now }
      changed++
    }
    await tx.flush()
    return { changed }
  })
}
