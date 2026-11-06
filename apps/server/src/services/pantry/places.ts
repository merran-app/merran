import {
  guessStorage,
  guessUseBy,
  type AisleKey,
  type StoragePlace,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { FoodPlacement } from "../../database/entities/index.ts"
import { householdKeys } from "../foods/aliases.ts"

// Where each food is kept at home. Moving all of a food to another place
// teaches it, like an aisle: the household's last move wins, and put-away,
// typed adds and receipts use it before guessing.

/** Remembers where these foods are kept (null forgets it). */
export async function rememberPlace(
  em: EntityManager,
  householdId: string,
  names: readonly string[],
  storedIn: StoragePlace | null
) {
  const keyOf = await householdKeys(em)
  const keys = [...new Set(names.map(keyOf))]
  if (keys.length === 0) return
  const known = new Map(
    (await em.find(FoodPlacement, { foodKey: { $in: keys } })).map(
      (placement) => [placement.foodKey, placement]
    )
  )
  for (const key of keys) {
    const placement = known.get(key)
    if (placement) placement.storedIn = storedIn
    // Nothing to forget, and no reason to make a row that says nothing.
    else if (storedIn)
      em.create(FoodPlacement, {
        household: householdId,
        foodKey: key,
        storedIn,
      })
  }
}

/**
 * Where a food goes, and its use-by guess: the place the household keeps
 * it, else a guess from its name and aisle. Nothing is guessed to use by
 * for what's frozen.
 */
export async function placeOf(
  em: EntityManager,
  householdId: string,
  food: { name: string; aisle: AisleKey | null },
  today: string
): Promise<{ storedIn: StoragePlace | null; useBy: string | null }> {
  const keyOf = await householdKeys(em)
  const remembered = await em.findOne(FoodPlacement, {
    household: householdId,
    foodKey: keyOf(food.name),
  })
  const storedIn = remembered?.storedIn ?? guessStorage(food.name, food.aisle)
  return {
    storedIn,
    useBy:
      storedIn === "freezer"
        ? null
        : guessUseBy(food.name, food.aisle, storedIn, today),
  }
}
