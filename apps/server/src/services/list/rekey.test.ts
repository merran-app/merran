import type { EntityManager } from "@mikro-orm/sql"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
  FoodAlias,
  FoodPlacement,
  PantryItem,
  Purchase,
  ShoppingItem,
  StoreProduct,
} from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { forHousehold } from "../../database/scope.ts"
import { createTestApp, setUpServer } from "../../test/app.ts"
import { rekeyHousehold } from "./rekey.ts"
import { forgetAlias, keepApart, sameAs } from "./teach.ts"

// Food keys made again: a list made before names were tidied, as it was
// left, tidied and joined up.

let database: Database
let close: () => Promise<void>
let householdId: string
let listId: string
let aisleId: string

beforeAll(async () => {
  const test = await createTestApp()
  ;({ database, close } = test)
  const kyle = await setUpServer(test.app, test.setupCode)
  householdId = (await (await kyle.get("/api/households/current")).json()).id
  const list = await (await kyle.get("/api/list")).json()
  listId = list.lists[0].id
  aisleId = list.aisles[0].id
})

afterAll(() => close())

test("tidies names from the plan, makes keys again, and joins lines", async () => {
  const em = forHousehold(database.em.fork(), householdId)
  const add = (
    name: string,
    quantity: number | null,
    unit: string | null,
    source: "plan" | "typed" = "plan",
    at = 0
  ) =>
    em.create(ShoppingItem, {
      household: householdId,
      list: listId,
      foodKey: name.toLowerCase(),
      name,
      quantity,
      unit,
      aisle: null,
      source,
      forMeals: [{ meal: `meal-${name}`, quantity, unit }],
      createdAt: new Date(Date.now() + at),
    })
  add("lemon wedges to serve", null, null, "plan", 0)
  add("lemon", 4, null, "plan", 1)
  add("garlic", 1, "head", "plan", 2)
  add("garlic", 6, "clove", "plan", 3)
  add("chopped parsley", 2, "tablespoon", "plan", 4)
  add("parsley", 2, "tablespoon", "plan", 5)
  add("(75 g) butter", 0.5, "cup", "plan", 6)
  add("Pinch of salt", null, null, "typed", 7)
  add("cooking salt", 3, "teaspoon", "plan", 8)
  add("cooking salt", 0.75, "teaspoon", "plan", 9)
  em.create(FoodPlacement, {
    household: householdId,
    foodKey: "chopped parsley",
    aisle: aisleId,
  })
  em.create(FoodPlacement, {
    household: householdId,
    foodKey: "parsley",
    aisle: aisleId,
  })
  em.create(Purchase, {
    household: householdId,
    foodKey: "old",
    name: "Boneless skinless chicken thighs",
    quantity: 2,
    unit: "pound",
    boughtOn: "2026-10-01",
  })
  await em.flush()

  const done = await rekeyHousehold(forHousehold(em, householdId))
  expect(done).toEqual({ renamed: 3, joined: 5 })

  const after = forHousehold(database.em.fork(), householdId)
  const items = await after.find(
    ShoppingItem,
    {},
    { orderBy: { createdAt: "asc" } }
  )
  expect(
    items.map((item) => [
      item.name,
      item.foodKey,
      item.quantity === null ? null : Number(item.quantity),
      item.unit,
    ])
  ).toEqual([
    // The wedges' line takes the lemons', with its name.
    ["lemon", "lemon", 4, null],
    ["garlic", "garlic", 16, "clove"],
    ["parsley", "parsley", 4, "tablespoon"],
    ["butter", "butter", 0.5, "cup"],
    // Salt with no amount joins the cooking salt's teaspoons, and the line
    // takes the name that goes with the amount.
    ["cooking salt", "salt", 3.75, "teaspoon"],
  ])
  // Each meal's share goes with the line it joined.
  expect(items[1]!.forMeals?.map((share) => share.meal)).toEqual([
    "meal-garlic",
    "meal-garlic",
  ])
  // Two aisle choices for one food: one is left, with the food's key.
  expect(
    (await after.find(FoodPlacement, {})).map((row) => row.foodKey)
  ).toEqual(["parsley"])

  // Purchases are keyed as the pantry keys food, for usual buys.
  expect((await after.find(Purchase, {})).map((row) => row.foodKey)).toEqual([
    "chicken thigh",
  ])

  // Again, nothing changes.
  expect(
    await rekeyHousehold(forHousehold(database.em.fork(), householdId))
  ).toEqual({
    renamed: 0,
    joined: 0,
  })
})

// Same as… and forgetting it: only the rows of the two foods are looked at,
// and they end as a full rekey would leave them.

const product = (name: string) => ({
  id: name,
  upc: null,
  name,
  brand: null,
  size: null,
  image: null,
  price: 100,
  salePrice: null,
  saleEnds: null,
  currency: "USD",
  aisle: null,
  inStock: true,
  url: null,
})

type Where = { householdId: string; listId: string; aisleId: string }

/** Rows of three foods in every table: the rice with the key it's given. */
async function seedFoods(em: EntityManager, where: Where, riceKey: string) {
  const { householdId, listId, aisleId } = where
  const at = Date.now()
  for (const [index, name] of FOODS.entries()) {
    const key = name === "rice" ? riceKey : name
    em.create(ShoppingItem, {
      household: householdId,
      list: listId,
      foodKey: key,
      name,
      quantity: 2,
      unit: null,
      aisle: null,
      source: "typed",
      createdAt: new Date(at + index),
    })
    em.create(FoodPlacement, {
      household: householdId,
      foodKey: key,
      aisle: aisleId,
    })
    em.create(StoreProduct, {
      household: householdId,
      store: "kroger",
      food: key,
      product: product(name),
    })
    em.create(PantryItem, {
      household: householdId,
      foodKey: key,
      name,
      quantity: 1,
      unit: null,
      aisle: aisleId,
    })
    em.create(Purchase, {
      household: householdId,
      foodKey: key,
      name,
      quantity: 1,
      unit: null,
      boughtOn: "2026-10-01",
    })
  }
  await em.flush()
}

// The first test's household has other rows, from the tests above.
const FOODS = ["vegan butter", "butter", "rice"]
const ourKeys = (keys: string[]) =>
  keys.filter((key) => FOODS.includes(key)).sort()

async function itemIds(em: EntityManager) {
  const items = await em.find(ShoppingItem, {})
  return new Map(items.map((item) => [item.name, item.id]))
}

/** A test on a server of its own, with its household's list and an aisle. */
async function onOwnServer(
  run: (database: Database, where: Where) => Promise<void>
) {
  const own = await createTestApp()
  try {
    const kyle = await setUpServer(own.app, own.setupCode)
    const household = await (await kyle.get("/api/households/current")).json()
    const list = await (await kyle.get("/api/list")).json()
    await run(own.database, {
      householdId: household.id as string,
      listId: list.lists[0].id as string,
      aisleId: list.aisles[0].id as string,
    })
  } finally {
    await own.close()
  }
}

describe("Same as…", () => {
  test("leaves the household as a full rekey would", async () => {
    const em = forHousehold(database.em.fork(), householdId)
    await seedFoods(em, { householdId, listId, aisleId }, "rice")
    const ids = await itemIds(em)

    const done = await sameAs(
      em,
      householdId,
      ids.get("vegan butter")!,
      ids.get("butter")!
    )
    expect(done).toEqual({ food: "butter", joined: 1 })

    const after = forHousehold(database.em.fork(), householdId)
    const keys = async (rows: Promise<{ foodKey: string }[]>) =>
      ourKeys((await rows).map((row) => row.foodKey))
    // The two lines are one, keyed "butter", and no other line of theirs is
    // left on the list.
    const items = await after.find(
      ShoppingItem,
      {},
      { orderBy: { createdAt: "asc" } }
    )
    expect(
      items
        .filter((row) => FOODS.includes(row.foodKey ?? ""))
        .map((row) => [row.name, row.foodKey, Number(row.quantity), row.unit])
    ).toEqual([
      // The first test's butter, in cups, which doesn't add up with these.
      ["butter", "butter", 0.5, "cup"],
      ["vegan butter", "butter", 4, null],
      ["rice", "rice", 2, null],
    ])
    expect(await keys(after.find(FoodPlacement, {}))).toEqual([
      "butter",
      "rice",
    ])
    expect(
      ourKeys((await after.find(StoreProduct, {})).map((row) => row.food))
    ).toEqual(["butter", "rice"])
    expect(await keys(after.find(PantryItem, {}))).toEqual([
      "butter",
      "butter",
      "rice",
    ])
    expect(await keys(after.find(Purchase, {}))).toEqual([
      "butter",
      "butter",
      "rice",
    ])
    expect(
      await rekeyHousehold(forHousehold(database.em.fork(), householdId))
    ).toEqual({ renamed: 0, joined: 0 })
  })

  test("forgetting it puts them back, and a full rekey finds nothing left", async () => {
    const em = forHousehold(database.em.fork(), householdId)
    const alias = await em.findOneOrFail(FoodAlias, { name: "vegan butter" })
    await forgetAlias(em, alias.id)

    const after = forHousehold(database.em.fork(), householdId)
    expect(await after.count(FoodAlias, {})).toBe(0)
    // The pantry and purchases of "vegan butter" key as they did before.
    const pantry = await after.find(PantryItem, {})
    expect(
      pantry
        .filter((row) => FOODS.includes(row.name))
        .map((row) => [row.name, row.foodKey])
        .sort()
    ).toEqual([
      ["butter", "butter"],
      ["rice", "rice"],
      ["vegan butter", "vegan butter"],
    ])
    expect(
      ourKeys((await after.find(Purchase, {})).map((row) => row.foodKey))
    ).toEqual(["butter", "rice", "vegan butter"])
    expect(
      await rekeyHousehold(forHousehold(database.em.fork(), householdId))
    ).toEqual({ renamed: 0, joined: 0 })
  })

  test("doesn't touch rows of other foods", async () => {
    // A household of its own: the rice rows carry a key an older vocabulary
    // would have made, which a full rekey would change.
    await onOwnServer(async (database, where) => {
      const em = forHousehold(database.em.fork(), where.householdId)
      await seedFoods(em, where, "stale rice")
      const ids = await itemIds(em)
      await sameAs(
        em,
        where.householdId,
        ids.get("vegan butter")!,
        ids.get("butter")!
      )

      const after = forHousehold(database.em.fork(), where.householdId)
      const riceLine = async () =>
        (await after.find(ShoppingItem, { name: "rice" })).map((row) => [
          row.foodKey,
          Number(row.quantity),
        ])
      expect(await riceLine()).toEqual([["stale rice", 2]])
      expect(
        (await after.find(Purchase, { name: "rice" })).map((row) => row.foodKey)
      ).toEqual(["stale rice"])
      expect(
        (await after.find(PantryItem, { name: "rice" })).map(
          (row) => row.foodKey
        )
      ).toEqual(["stale rice"])
      expect(
        (await after.find(FoodPlacement, { foodKey: "stale rice" })).length
      ).toBe(1)
      expect(
        (await after.find(StoreProduct, { food: "stale rice" })).length
      ).toBe(1)
      // A full rekey would have changed them.
      await rekeyHousehold(after)
      expect(
        (await after.find(Purchase, { name: "rice" })).map((row) => row.foodKey)
      ).toEqual(["rice"])
      expect(await riceLine()).toEqual([["rice", 2]])
    })
  })

  test("moves a line with no key whose name is one of the two foods", async () => {
    await onOwnServer(async (database, where) => {
      const em = forHousehold(database.em.fork(), where.householdId)
      await seedFoods(em, where, "rice")
      // A line kept before lines had keys, named for the food being joined.
      em.create(ShoppingItem, {
        household: where.householdId,
        list: where.listId,
        foodKey: null,
        name: "Vegan butter",
        quantity: 1,
        unit: null,
        aisle: null,
        source: "typed",
        createdAt: new Date(Date.now() + 10),
      })
      await em.flush()
      const ids = await itemIds(em)

      const done = await sameAs(
        em,
        where.householdId,
        ids.get("vegan butter")!,
        ids.get("butter")!
      )
      // It joins the butter line, as the "butter" line does.
      expect(done).toEqual({ food: "butter", joined: 2 })

      const after = forHousehold(database.em.fork(), where.householdId)
      expect(
        (
          await after.find(ShoppingItem, {}, { orderBy: { createdAt: "asc" } })
        ).map((row) => [row.foodKey, Number(row.quantity)])
      ).toEqual([
        ["butter", 5],
        ["rice", 2],
      ])
      expect(await rekeyHousehold(after)).toEqual({ renamed: 0, joined: 0 })
    })
  })
})

describe("Not the same", () => {
  test("forgetting it joins the name's rows to its food's, as a full rekey would", async () => {
    // "unsalted butter" was kept apart from "butter", the vocabulary's food
    // for it, and each has an aisle, a Kroger product and a line on the list.
    await onOwnServer(async (database, { householdId, listId, aisleId }) => {
      const em = forHousehold(database.em.fork(), householdId)
      const at = Date.now()
      for (const [index, name] of ["unsalted butter", "butter"].entries()) {
        em.create(ShoppingItem, {
          household: householdId,
          list: listId,
          foodKey: name,
          name,
          quantity: 2,
          unit: null,
          aisle: null,
          source: "typed",
          createdAt: new Date(at + index),
        })
        em.create(FoodPlacement, {
          household: householdId,
          foodKey: name,
          aisle: aisleId,
        })
        em.create(StoreProduct, {
          household: householdId,
          store: "kroger",
          food: name,
          product: product(name),
        })
      }
      await em.flush()
      const ids = await itemIds(em)
      await keepApart(em, householdId, ids.get("unsalted butter")!, [
        "unsalted butter",
      ])
      const alias = await em.findOneOrFail(FoodAlias, {
        name: "unsalted butter",
      })

      await forgetAlias(em, alias.id)

      const after = forHousehold(database.em.fork(), householdId)
      expect(await after.count(FoodAlias, {})).toBe(0)
      // One aisle and one product for the food, and the two lines joined.
      expect(
        (await after.find(FoodPlacement, {})).map((row) => row.foodKey)
      ).toEqual(["butter"])
      expect(
        (await after.find(StoreProduct, {})).map((row) => row.food)
      ).toEqual(["butter"])
      expect(
        (await after.find(ShoppingItem, {})).map((row) => [
          row.foodKey,
          Number(row.quantity),
        ])
      ).toEqual([["butter", 4]])
      expect(await rekeyHousehold(after)).toEqual({ renamed: 0, joined: 0 })
    })
  })
})
