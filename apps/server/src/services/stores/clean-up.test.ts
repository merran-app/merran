import { afterAll, beforeAll, expect, test } from "vitest"
import { addDays } from "@merran/shared"
import { Household, StorePrice } from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { createTestDatabase } from "../../test/database.ts"
import { clearOldPrices } from "./clean-up.ts"

let database: Database
let close: () => Promise<void>

beforeAll(async () => {
  ;({ database, close } = await createTestDatabase())
})

afterAll(() => close())

test("prices past 91 days go, and the 90 days read stay", async () => {
  const now = new Date("2026-11-27T12:00:00Z")
  const today = "2026-11-27"
  const em = database.em.fork()
  const household = em.create(Household, { name: "Home", slug: "home" })
  const daysAgo = [0, 30, 90, 91, 92, 200]
  for (const ago of daysAgo) {
    em.create(StorePrice, {
      household,
      store: "kroger",
      productId: "milk",
      day: addDays(today, -ago),
      price: 399,
      currency: "USD",
    })
  }
  await em.flush()

  expect(await clearOldPrices(database.em.fork(), now)).toBe(2)

  const left = await database.em
    .fork()
    .find(StorePrice, {}, { filters: false, orderBy: { day: "desc" } })
  expect(left.map((price) => price.day)).toEqual(
    [0, 30, 90, 91].map((ago) => addDays(today, -ago))
  )
})
