import type { BasketDeps } from "../basket/types.ts"
import {
  lineFor,
  itemsLeft,
  itemsToGet,
  amountOf,
  foodOf,
} from "../basket/items.ts"
import { choose } from "../basket/products.ts"
import { recordPrices } from "../basket/prices.ts"
import { shoppingName, type StoreProduct as Product } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../../core/errors.ts"
import {
  ShoppingItem,
  StoreProduct,
  type StoreLocation,
} from "../../../database/entities/index.ts"
import { householdToday } from "../../households/clock.ts"
import { judgeSales } from "../history.ts"
import { sentDetails } from "../sent.ts"
import {
  accountToken,
  KROGER,
  krogerConnection,
  modalityOf,
  needKrogerApp,
} from "./connection.ts"
import {
  addToCart,
  productsById,
  searchProducts,
  type KrogerApp,
} from "./client.ts"

// What goes in a Kroger cart: each thing on the list for Kroger gets a
// product, the one the household picked before or Merran's pick from the
// store's search, with how many and what it costs; then it's sent.

/** Searches at once while picking products. */
const AT_ONCE = 4

/** Products offered to choose from for each thing. */
const OPTIONS = 8

/** The household's store, the app, and its connection; or why not. */
export async function ready(deps: BasketDeps, em: EntityManager) {
  const app = await needKrogerApp(deps)
  const connection = await krogerConnection(em)
  if (!connection?.location) {
    throw new AppError(
      "unprocessable",
      "kroger_no_store",
      "Pick the household's Kroger store first, in Settings, Household, Stores."
    )
  }
  return { app, connection, location: connection.location }
}

/** Searches the store for each food, a few at a time. */
export async function searchAll(
  deps: BasketDeps,
  app: KrogerApp,
  location: StoreLocation,
  terms: string[]
) {
  const results: Product[][] = []
  for (let i = 0; i < terms.length; i += AT_ONCE) {
    results.push(
      ...(await Promise.all(
        terms.slice(i, i + AT_ONCE).map((term) =>
          searchProducts(deps.fetcher, app, {
            term,
            location,
            limit: OPTIONS,
          }).catch(() => [])
        )
      ))
    )
  }
  return results
}

/**
 * The cart to look over before sending: each thing on the list for
 * Kroger with its product (refreshed, with today's price), and Merran's
 * pick for things without one.
 */
export async function krogerBasket(
  deps: BasketDeps,
  em: EntityManager,
  who: { householdId: string; userId: string | null },
  itemIds?: readonly string[]
) {
  const { app, connection, location } = await ready(deps, em)
  const items = await itemsToGet(em, itemIds)
  const foods = [...new Set(items.map(foodOf))]
  const kept = new Map(
    (await em.find(StoreProduct, { store: KROGER, food: { $in: foods } })).map(
      (row) => [row.food, row]
    )
  )

  // Today's prices for what's kept.
  if (kept.size > 0) {
    const fresh = await productsById(deps.fetcher, app, {
      ids: [...kept.values()].map((row) => row.product.id),
      location,
    }).catch(() => [])
    const byId = new Map(fresh.map((product) => [product.id, product]))
    for (const row of kept.values()) {
      const now = byId.get(row.product.id)
      if (now) row.product = now
    }
    await recordPrices(em, who.householdId, fresh, KROGER)
  }

  // Picks for the rest.
  const missing = foods.filter((food) => !kept.has(food))
  if (missing.length > 0) {
    const firsts = missing.map((food) =>
      items.find((item) => foodOf(item) === food)!
    )
    // The food as it's bought: something typed onto the list can still
    // say "Pinch of salt" or "chopped parsley".
    const named = firsts.map((item) => shoppingName(item.name))
    const results = await searchAll(deps, app, location, named)
    await recordPrices(em, who.householdId, results.flat(), KROGER)
    const asks = missing.map((food, i) => ({
      food,
      text: [amountOf(firsts[i]!), named[i]].filter(Boolean).join(" "),
      products: results[i] ?? [],
    }))
    const offered = asks.filter((ask) => ask.products.length > 0)
    const picks = await choose(deps, em, who, offered)
    offered.forEach((ask, i) => {
      const product = picks[i]
      if (!product) return
      kept.set(
        ask.food,
        em.create(StoreProduct, {
          household: who.householdId,
          store: KROGER,
          food: ask.food,
          product,
          chosen: false,
        })
      )
    })
  }
  await em.flush()
  const sales = await judgeSales(
    em,
    [...kept.values()].map((row) => row.product),
    await householdToday(em, who.householdId)
  )

  return {
    store: location.banner,
    location,
    modality: modalityOf(connection),
    linked: Boolean(connection.account && !connection.broken),
    sentAt: connection.lastSent?.at ?? null,
    lines: items.map((item) =>
      lineFor(item, kept.get(foodOf(item)), connection, sales)
    ),
  }
}

/** The store's products for some words, to pick another. */
export async function searchKroger(
  deps: BasketDeps,
  em: EntityManager,
  words: string
) {
  const { app, location } = await ready(deps, em)
  return searchProducts(deps.fetcher, app, { term: words, location, limit: 20 })
}

/**
 * The product a person picked for a thing on the list: kept for its food
 * from now on, and never replaced by itself.
 */
export async function pickKrogerProduct(
  deps: BasketDeps,
  em: EntityManager,
  options: { householdId: string; itemId: string; productId: string }
) {
  const { connection } = await ready(deps, em)
  const item = await em.findOne(ShoppingItem, { id: options.itemId })
  if (!item) {
    throw new AppError("not_found", "item_not_found", "That isn't on the list.")
  }
  const row = await saveKrogerProduct(deps, em, {
    householdId: options.householdId,
    food: foodOf(item),
    productId: options.productId,
  })
  const sales = await judgeSales(
    em,
    [row.product],
    await householdToday(em, options.householdId)
  )
  return lineFor(item, row, connection, sales)
}

/** Save a person's product for a food, whether or not it is on a list. */
export async function saveKrogerProduct(
  deps: BasketDeps,
  em: EntityManager,
  options: { householdId: string; food: string; productId: string }
) {
  const { app, location } = await ready(deps, em)
  const [product] = await productsById(deps.fetcher, app, {
    ids: [options.productId],
    location,
  })
  if (!product) {
    throw new AppError(
      "not_found",
      "kroger_product_not_found",
      "That product isn't at the household's store."
    )
  }
  const row =
    (await em.findOne(StoreProduct, { store: KROGER, food: options.food })) ??
    em.create(StoreProduct, {
      household: options.householdId,
      store: KROGER,
      food: options.food,
      product,
    })
  row.product = product
  row.chosen = true
  await em.flush()
  await recordPrices(em, options.householdId, [product], KROGER)
  return row
}

/**
 * Adds the lines ticked to the linked account's Kroger cart, by barcode,
 * so many of each. Their products are kept as the household's from now on.
 */
export async function sendKrogerBasket(
  deps: BasketDeps,
  em: EntityManager,
  lines: { itemId: string; packages: number }[]
) {
  const { connection, location } = await ready(deps, em)
  const items = await em.find(ShoppingItem, {
    id: { $in: lines.map((line) => line.itemId) },
  })
  const foods = new Map(items.map((item) => [item.id, foodOf(item)]))
  const kept = new Map(
    (
      await em.find(StoreProduct, {
        store: KROGER,
        food: { $in: [...foods.values()] },
      })
    ).map((row) => [row.food, row])
  )
  const byUpc = new Map<string, number>()
  const sent: Record<string, number> = {}
  const details = { ...connection.lastSent?.details }
  for (const line of lines) {
    const food = foods.get(line.itemId)
    const row = food ? kept.get(food) : undefined
    const upc = row?.product.upc
    if (!row || !upc) continue
    byUpc.set(upc, (byUpc.get(upc) ?? 0) + line.packages)
    sent[line.itemId] = line.packages
    const item = items.find((item) => item.id === line.itemId)!
    details[item.id] = sentDetails(item, row.product, amountOf(item))
    row.chosen = true
  }
  if (byUpc.size === 0) {
    throw new AppError(
      "invalid",
      "nothing_to_send",
      "None of those has a product to send."
    )
  }
  const token = await accountToken(deps, em, connection)
  await addToCart(
    deps.fetcher,
    token,
    [...byUpc].map(([upc, quantity]) => ({
      upc,
      quantity,
      modality: modalityOf(connection),
    }))
  )
  // Remember what went, while it's still on the list.
  const stillOn = new Set((await itemsLeft(em)).map((item) => item.id))
  connection.lastSent = {
    at: new Date().toISOString(),
    details: Object.fromEntries(
      Object.entries(details).filter(([id]) => stillOn.has(id))
    ),
    items: {
      ...Object.fromEntries(
        Object.entries(connection.lastSent?.items ?? {}).filter(([id]) =>
          stillOn.has(id)
        )
      ),
      ...sent,
    },
  }
  await em.flush()
  return {
    sent: Object.keys(sent).length,
    store: location.banner,
    cartUrl: `https://www.${location.domain}/cart`,
  }
}
