import type { StoragePlace } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { PantryItem } from "../../../database/entities/index.ts"
import { toNumber } from "../../../database/numbers.ts"
import type { GatheredPart } from "../gathering/gathering.ts"
import { record } from "../record.ts"

// What the pantry tells webhooks: pantry.changed, gathered from everything
// put in, used up, moved, changed and taken out, whatever did it. Each
// pantry function says what it did, once, with its totals.

/** What a change did to the pantry: a count it leaves out is none. */
export type PantryCounts = GatheredPart<"pantry.changed">

/**
 * Tells webhooks what a change did to the pantry. A change that counts
 * nothing records nothing.
 */
export async function recordPantryChange(
  em: EntityManager,
  householdId: string,
  counts: PantryCounts
): Promise<void> {
  await record(em, householdId, { type: "pantry.changed", data: counts })
}

/**
 * What taking a list row's put-away back out of one pantry item and
 * putting it in again did, by the items' ids: the same item changed, or
 * one taken from and another put in. Null is no item: nothing was there
 * to take back from, or nothing went in.
 */
export function putInAgain(
  tookFrom: string | null,
  wentInto: string | null
): PantryCounts {
  if (tookFrom !== null && tookFrom === wentInto) return { changed: 1 }
  return {
    removed: tookFrom === null ? 0 : 1,
    added: wentInto === null ? 0 : 1,
  }
}

/** Something at home as people see it: where it's kept, and the rest. */
export type Kept = {
  storedIn: StoragePlace | null
  useBy: string | null
  /** Its name, amount and aisle. */
  shown: string
}

/** Something at home as it is now, to tell later what changing it did. */
export function asKept(item: PantryItem): Kept {
  return {
    storedIn: item.storedIn ?? null,
    useBy: item.useBy ?? null,
    shown: JSON.stringify([
      item.name,
      toNumber(item.quantity),
      item.unit ?? null,
      item.amountText ?? null,
      item.aisle?.id ?? null,
    ]),
  }
}

/**
 * What changing something at home did: moved, when it's kept somewhere
 * else now; changed, when its name, amount, aisle or use-by date is
 * different. A use-by date that goes or comes back with a move (the
 * freezer takes it off) is part of the move.
 */
export function pantryChange(
  was: Kept,
  item: PantryItem
): { moved: number; changed: number } {
  const now = asKept(item)
  const moved = now.storedIn !== was.storedIn
  const changed = now.shown !== was.shown || (!moved && now.useBy !== was.useBy)
  return { moved: moved ? 1 : 0, changed: changed ? 1 : 0 }
}
