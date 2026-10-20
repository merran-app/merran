import {
  foodKeyIn,
  foodName,
  householdKey,
  lineFoods,
  shoppingName,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import {
  PantryItem,
  Purchase,
  RecipeIngredient,
  ShoppingItem,
  StoreProduct,
} from "../../database/entities/index.ts"
import { householdAliases } from "../foods/aliases.ts"
import { yourStores } from "./yours.ts"
import type { StoreDeps } from "./store-connections.ts"

/** Foods the household uses, and the product kept for each connected store. */
export async function productMappings(
  deps: Pick<StoreDeps, "settings">,
  em: EntityManager,
  householdId: string
) {
  const stores = (await yourStores(deps, em, householdId)).filter(
    (store) => store.connected
  )
  const aliases = await householdAliases(em)
  const foods = new Map<string, string>()
  const remember = (name: string, key: string) => {
    const food = householdKey(name, key, aliases)
    if (!foods.has(food)) foods.set(food, foodName(food) ?? name)
  }

  const [ingredients, listItems, pantryItems, purchases, mappings] =
    await Promise.all([
      em.find(RecipeIngredient, {}, { fields: ["rawText", "foodKey"] }),
      em.find(ShoppingItem, {}, { fields: ["name", "foodKey"] }),
      em.find(PantryItem, {}, { fields: ["name", "foodKey"] }),
      em.find(Purchase, {}, { fields: ["name", "foodKey"] }),
      em.find(StoreProduct, {
        store: { $in: stores.map((store) => store.key) },
      }),
    ])

  for (const ingredient of ingredients) {
    if (ingredient.foodKey) {
      remember(shoppingName(ingredient.rawText), ingredient.foodKey)
      continue
    }
    for (const food of lineFoods(ingredient.rawText)) {
      remember(food.name, food.key)
    }
  }
  for (const item of [...listItems, ...pantryItems, ...purchases]) {
    remember(item.name, item.foodKey ?? foodKeyIn(item.name, aliases))
  }
  for (const mapping of mappings) {
    if (!foods.has(mapping.food)) {
      foods.set(mapping.food, foodName(mapping.food) ?? mapping.food)
    }
  }

  return {
    stores,
    foods: [...foods]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([food, name]) => ({
        food,
        name,
        products: mappings
          .filter((mapping) => mapping.food === food)
          .map((mapping) => ({
            store: mapping.store,
            product: mapping.product,
            chosen: mapping.chosen,
            updatedAt: mapping.updatedAt.toISOString(),
          })),
      })),
  }
}

/** Resolve a requested food through this household's names before saving. */
export async function mappingFood(em: EntityManager, name: string) {
  const food = foodKeyIn(name.trim(), await householdAliases(em))
  if (!food || food.length > 150) {
    throw new AppError("invalid", "food_invalid", "Name a food to buy.")
  }
  return food
}

/** Forget a selected product. A future basket may offer a fresh suggestion. */
export async function forgetProductMapping(
  em: EntityManager,
  store: string,
  food: string
) {
  const row = await em.findOne(StoreProduct, { store, food })
  if (!row) return
  em.remove(row)
  await em.flush()
}
