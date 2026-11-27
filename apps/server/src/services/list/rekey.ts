import {
  foodKey,
  joinAmounts,
  plainKey,
  FOOD_KEYS_VERSION,
  shoppingName,
} from "@merran/shared"
import type { FilterQuery } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import {
  FoodPlacement,
  Household,
  Job,
  PantryItem,
  Purchase,
  ShoppingItem,
  StoreProduct,
} from "../../database/entities/index.ts"
import { forHousehold } from "../../database/scope.ts"
import { enqueue } from "../jobs/jobs.ts"
import type { JobHandler } from "../jobs/runner.ts"
import { toNumber } from "../../database/numbers.ts"
import { householdKeys } from "../foods/aliases.ts"

// When food keys are made differently (FOOD_KEYS_VERSION), the ones kept
// on lists, in the pantry, for aisles, purchases and store products are
// made again, once, so what's there matches what's added next. Lists made
// from the plan get the tidier names too, and lines that turn out to be
// the same food join up: "(75 g) butter" and "butter" are one line.

export const REKEY_FOODS = "foods.rekey"

const keyOf = (version: number) => `${REKEY_FOODS}:${version}`

/** Asks for the re-keying at start, unless it's been done for this version. */
export async function rekeyFoodsSoon(em: EntityManager) {
  const done = await em.findOne(Job, {
    key: keyOf(FOOD_KEYS_VERSION),
    status: "done",
  })
  if (done) return
  await enqueue(em, {
    kind: REKEY_FOODS,
    key: keyOf(FOOD_KEYS_VERSION),
    runAt: new Date(Date.now() + 30_000),
    maxAttempts: 1,
  })
}

/** Which rows a re-keying looks at, and what it's told to do with them. */
type RekeyScope = {
  items: FilterQuery<ShoppingItem>
  placements: FilterQuery<FoodPlacement>
  products: FilterQuery<StoreProduct>
  pantry: FilterQuery<PantryItem>
  purchases: FilterQuery<Purchase>
  /** Of the list items read, the ones that count. Everything, if not set. */
  wanted?: (item: ShoppingItem, keyFor: (name: string) => string) => boolean
}

/** One household's keys and list names, made again. */
export async function rekeyHousehold(em: EntityManager) {
  return rekeyRows(em, {
    items: {},
    placements: {},
    products: {},
    pantry: {},
    purchases: {},
  })
}

/**
 * The rows of some foods, their keys made again. "Same as…" and forgetting
 * it change only the two foods' keys, so a household with years of lists
 * and purchases isn't read and saved whole. It does what `rekeyHousehold`
 * does, to these rows only: the others are already as it would leave them.
 */
export async function rekeyFoods(em: EntityManager, keys: readonly string[]) {
  const foods = new Set(keys)
  return rekeyRows(em, {
    // A line with no key yet is matched by what its name would key to.
    items: { $or: [{ foodKey: { $in: [...foods] } }, { foodKey: null }] },
    placements: { foodKey: { $in: [...foods] } },
    products: { food: { $in: [...foods] } },
    pantry: { foodKey: { $in: [...foods] } },
    purchases: { foodKey: { $in: [...foods] } },
    wanted: (item, keyFor) =>
      item.foodKey !== null && item.foodKey !== undefined
        ? foods.has(item.foodKey)
        : foods.has(plainKey(item.name)) || foods.has(keyFor(item.name)),
  })
}

/** The work of both, over the rows the scope reads. */
async function rekeyRows(em: EntityManager, scope: RekeyScope) {
  // The household's own names for foods count.
  const keyFor = await householdKeys(em)
  let renamed = 0
  let joined = 0

  // Lists: names from the plan tidied, every key made again, then lines of
  // the same food on the same list joined where they add up.
  const read = await em.find(ShoppingItem, scope.items, {
    orderBy: { createdAt: "asc", id: "asc" },
  })
  const items = scope.wanted
    ? read.filter((item) => scope.wanted!(item, keyFor))
    : read
  for (const item of items) {
    if (item.source === "plan") {
      const name = shoppingName(item.name)
      if (name !== item.name) {
        item.name = name
        renamed++
      }
    }
    item.foodKey = keyFor(item.name)
  }
  const kept: ShoppingItem[] = []
  for (const item of items) {
    // The first line of the same food on the same list it joins with.
    let same: ShoppingItem | undefined
    let sum: ReturnType<typeof joinAmounts> = null
    for (const other of item.checked || item.amountText ? [] : kept) {
      if (
        other.checked ||
        other.amountText ||
        other.list.id !== item.list.id ||
        other.foodKey !== item.foodKey
      )
        continue
      sum = joinAmounts(
        { quantity: toNumber(other.quantity), unit: other.unit ?? null },
        { quantity: toNumber(item.quantity), unit: item.unit ?? null },
        item.foodKey ?? undefined
      )
      if (sum) {
        same = other
        break
      }
    }
    if (same && sum) {
      // The name that goes with the amount: 4 lemons, not 4 lemon wedges.
      if (same.quantity == null && item.quantity != null) same.name = item.name
      em.assign(same, {
        quantity: sum.quantity,
        unit: sum.unit,
        forMeals: [...(same.forMeals ?? []), ...(item.forMeals ?? [])],
      })
      em.remove(item)
      joined++
    } else kept.push(item)
  }

  // Aisles chosen for a food: the latest wins where two become one.
  const placements = await em.find(FoodPlacement, scope.placements, {
    orderBy: { updatedAt: "desc" },
  })
  const placed = new Map<string, FoodPlacement>()
  for (const placement of placements) {
    const key = keyFor(placement.foodKey)
    if (placed.has(key)) em.remove(placement)
    else placed.set(key, placement)
  }

  // Store products: the one a person picked, else the latest.
  const products = await em.find(StoreProduct, scope.products, {
    orderBy: { chosen: "desc", updatedAt: "desc" },
  })
  const stocked = new Map<string, StoreProduct>()
  for (const product of products) {
    const key = `${product.store}|${keyFor(product.food)}`
    if (stocked.has(key)) em.remove(product)
    else stocked.set(key, product)
  }
  // What two became one goes first, so the one left can take its key.
  await em.flush()
  for (const [key, placement] of placed) placement.foodKey = key
  for (const product of stocked.values()) product.food = keyFor(product.food)

  for (const row of await em.find(PantryItem, scope.pantry)) {
    row.foodKey = keyFor(row.name)
  }
  // Purchases are matched as the pantry matches food, for usual buys.
  for (const row of await em.find(Purchase, scope.purchases)) {
    row.foodKey = keyFor(row.name)
  }

  await em.flush()
  return { renamed, joined }
}

/** Every household's food keys, made again for this version. */
export const rekeyFoodsJob: JobHandler = {
  kind: REKEY_FOODS,
  lane: "long",
  area: "list",
  async run({ em, logger }) {
    let renamed = 0
    let joined = 0
    for (const household of await em.find(Household, {}, { fields: ["id"] })) {
      const done = await rekeyHousehold(forHousehold(em, household.id))
      renamed += done.renamed
      joined += done.joined
    }
    logger.info(
      { version: FOOD_KEYS_VERSION, renamed, joined },
      "Made food keys again"
    )
    return { version: FOOD_KEYS_VERSION, renamed, joined }
  },
}
