import type { EntityManager } from "@mikro-orm/sql"
import type { ShoppingItem } from "../../../database/entities/index.ts"
import { toNumber } from "../../../database/numbers.ts"
import type { GatheredPart } from "../gathering/gathering.ts"
import { record } from "../record.ts"

// What the list tells webhooks: list.changed, gathered from everything put
// on the list, changed on it and taken off, whatever did it. Each list
// function says which rows it touched and what it did with them, once,
// with its totals; the merge says how each list stands.

type ListCounts = Omit<GatheredPart<"list.changed">, "lists">

/**
 * A row as people see it on the list: its name, amount, aisle and list.
 * A change to any of them is a change; checking it off isn't, it's
 * `checked`.
 */
export function asShown(item: ShoppingItem): string {
  return JSON.stringify([
    item.name,
    toNumber(item.quantity),
    item.unit ?? null,
    item.amountText ?? null,
    item.aisle?.id ?? null,
    item.list.id,
  ])
}

/**
 * Tells webhooks what a change did to the list: the rows it touched, and
 * how many it added, changed and took off. The lists touched are the rows'
 * own, and for rows moved, the lists they came from. Rows taken off still
 * say their list. Nothing touched records nothing.
 */
export async function recordListChange(
  em: EntityManager,
  householdId: string,
  rows: readonly ShoppingItem[],
  counts: ListCounts,
  options: { movedFrom?: readonly string[] } = {}
): Promise<void> {
  if (rows.length === 0) return

  const lists = new Set([
    ...rows.map((row) => row.list.id),
    ...(options.movedFrom ?? []),
  ])
  await record(em, householdId, {
    type: "list.changed",
    data: { lists: [...lists], ...counts },
  })
}
