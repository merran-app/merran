import type { EntityManager } from "@mikro-orm/sql"
import { ShoppingItem, ShoppingList } from "../../../database/entities/index.ts"
import { toNumber } from "../../../database/numbers.ts"
import type { GatheredPart } from "../gathering/gathering.ts"
import { record, wantsEvent } from "../record.ts"

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

/**
 * Tells webhooks what checking rows off, or not, did: how many were checked
 * or unchecked, and each list that checking finished. `claimed` is the rows
 * whose state really changed, so a row two phones checked at once counts
 * once. Undo restores the list as it was, so it never finishes one.
 */
export async function recordChecking(
  tx: EntityManager,
  householdId: string,
  claimed: readonly ShoppingItem[],
  checked: boolean,
  options: { undo: boolean }
): Promise<void> {
  if (claimed.length === 0) return

  // A finished list is sent at once, not gathered, so it goes first: the
  // gathered change below holds the merge job's lock until the transaction
  // ends.
  if (checked && !options.undo) {
    await recordFinishedLists(tx, householdId, claimed)
  }

  const lists = new Set(claimed.map((row) => row.list.id))
  await record(tx, householdId, {
    type: "list.changed",
    data: {
      lists: [...lists],
      ...(checked
        ? { checked: claimed.length }
        : { unchecked: claimed.length }),
    },
  })
}

/** Each list among the rows just checked that has nothing left unchecked. */
async function recordFinishedLists(
  tx: EntityManager,
  householdId: string,
  claimed: readonly ShoppingItem[]
): Promise<void> {
  // Counting costs queries, so a household with no webhook for it pays
  // nothing.
  if (!(await wantsEvent(tx, householdId, "list.completed"))) return

  const listIds = new Set(claimed.map((row) => row.list.id))
  for (const listId of listIds) {
    const left = await tx.count(ShoppingItem, { list: listId, checked: false })
    if (left > 0) continue
    await recordCompleted(tx, householdId, listId, {
      bought: await tx.count(ShoppingItem, { list: listId, checked: true }),
      left: 0,
    })
  }
}

/**
 * Tells webhooks that Put away is clearing lists that still have unchecked
 * things on them: the trip is over with things left. A list with nothing
 * unchecked was finished when its last row was checked off, so it says
 * nothing more. It counts the rows as they are, so call it before they go.
 */
export async function recordPutAwayFinished(
  tx: EntityManager,
  householdId: string,
  checked: readonly ShoppingItem[]
): Promise<void> {
  if (checked.length === 0) return
  if (!(await wantsEvent(tx, householdId, "list.completed"))) return

  const bought = new Map<string, number>()
  for (const row of checked) {
    bought.set(row.list.id, (bought.get(row.list.id) ?? 0) + 1)
  }
  for (const [listId, boughtCount] of bought) {
    const left = await tx.count(ShoppingItem, { list: listId, checked: false })
    if (left === 0) continue
    await recordCompleted(tx, householdId, listId, {
      bought: boughtCount,
      left,
    })
  }
}

async function recordCompleted(
  tx: EntityManager,
  householdId: string,
  listId: string,
  counts: { bought: number; left: number }
): Promise<void> {
  const list = await tx.findOneOrFail(ShoppingList, { id: listId })
  await record(tx, householdId, {
    type: "list.completed",
    data: { list: { id: list.id, name: list.name }, ...counts },
  })
}
