import { clockIn } from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { FoodPlacement, Receipt } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { forHousehold } from "../../../database/scope.ts"
import {
  createTestApp,
  setUpServer,
  type TestClient,
} from "../../../test/app.ts"
import {
  eventsFrom,
  gatherNow,
  listenToEverything,
} from "../../../test/webhooks.ts"
import type { JobRunner } from "../../jobs/runner.ts"

// pantry.changed: everything put in the pantry, used up, moved, changed
// and taken out, whatever did it, gathered into one event for each person.
// Checking off the list puts things away too: that's told with checking
// off, in list.test.ts.

let app: App
let database: Database
let jobs: JobRunner
let close: () => Promise<void>
let kyle: TestClient
let home: string
let today: string

type Item = { id: string; name: string; storedIn: string | null }

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, database, jobs, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  home = (
    await (
      await kyle.patch("/api/households/current", {
        timeZone: "UTC",
        weekStartsOn: 1,
        country: "US",
      })
    ).json()
  ).id
  today = clockIn("UTC").today

  const recipe = await kyle.post("/api/recipes", {
    name: "Lemon Chicken",
    servings: 4,
    ingredients: ["2 lb chicken thighs", "2 lemons"],
    steps: ["Cook it."],
  })
  expect(recipe.status, await recipe.clone().text()).toBe(201)

  await listenToEverything(kyle)
})

afterAll(() => close())

async function add(text: string, storedIn?: string) {
  const res = await kyle.post("/api/pantry/items", { text, storedIn })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as Item
}

/** Lemon Chicken for dinner today, planned. */
async function planLemonChicken() {
  const res = await kyle.post("/api/plan/entries", {
    date: today,
    meal: "dinner",
    recipe: "lemon-chicken",
  })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as { id: string }
}

async function setStatus(id: string, status: "cooked" | "planned") {
  const res = await kyle.patch(`/api/plan/entries/${id}`, { status })
  expect(res.status, await res.clone().text()).toBe(200)
}

/**
 * The plan, the pantry and the list emptied, and what that gathered let
 * go. Meals first: taking a cooked one off puts back what it used. Moving
 * things teaches where they go, so that's forgotten too.
 */
async function clearAll() {
  const entries = (
    await (await kyle.get(`/api/plan?from=${today}&to=${today}`)).json()
  ).entries as { id: string }[]
  if (entries.length > 0) {
    await kyle.post("/api/plan/entries/bulk", {
      ids: entries.map((entry) => entry.id),
      action: "remove",
    })
  }
  await kyle.post("/api/pantry/clear")
  await kyle.post("/api/list/clear", { which: "all" })
  await forHousehold(database.em.fork(), home).nativeDelete(FoodPlacement, {})
  await gatherNow(database, jobs)
}

/** The pantry.changed events an action sends once they're gathered. */
async function pantryChanges(action: () => Promise<unknown>) {
  const sent = await eventsFrom(database, home, async () => {
    await action()
    await gatherNow(database, jobs)
  })
  return sent.filter((event) => event.type === "pantry.changed")
}

describe("pantry.changed", () => {
  test("adding one tells webhooks", async () => {
    await clearAll()

    const sent = await pantryChanges(() => add("2 lb chicken thighs"))

    expect(sent).toEqual([
      {
        type: "pantry.changed",
        household: { id: home, name: expect.any(String) },
        by: { id: expect.any(String), name: "Kyle" },
        via: "app",
        key: null,
        added: 1,
        usedUp: 0,
        moved: 0,
        changed: 0,
        removed: 0,
      },
    ])
  })

  test("adding to what's there changes it", async () => {
    await clearAll()
    await add("2 lb chicken thighs")
    await gatherNow(database, jobs)

    const sent = await pantryChanges(() => add("1 lb chicken thighs"))

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ added: 0, changed: 1 })
  })

  test("moving one to the freezer moves it", async () => {
    await clearAll()
    const chicken = await add("2 lb chicken thighs")
    await gatherNow(database, jobs)

    // The freezer takes its use-by date off: that's part of the move.
    const sent = await pantryChanges(() =>
      kyle.patch(`/api/pantry/items/${chicken.id}`, { storedIn: "freezer" })
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ moved: 1, changed: 0 })
  })

  test("editing the amount is a change, and the same again is nothing", async () => {
    await clearAll()
    const chicken = await add("2 lb chicken thighs")
    await gatherNow(database, jobs)

    const edited = await pantryChanges(() =>
      kyle.patch(`/api/pantry/items/${chicken.id}`, { amount: "3 lb" })
    )
    expect(edited).toHaveLength(1)
    expect(edited[0]).toMatchObject({ moved: 0, changed: 1 })

    const again = await pantryChanges(() =>
      kyle.patch(`/api/pantry/items/${chicken.id}`, { amount: "3 lb" })
    )
    expect(again).toEqual([])
  })

  test("splitting one moves some of it", async () => {
    await clearAll()
    const chicken = await add("2 lb chicken thighs")
    await gatherNow(database, jobs)

    const sent = await pantryChanges(async () => {
      const res = await kyle.post(`/api/pantry/items/${chicken.id}/split`, {
        amount: "1 lb",
        storedIn: "freezer",
      })
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ added: 0, moved: 1, changed: 0 })
  })

  test("Used up uses one up", async () => {
    await clearAll()
    const chicken = await add("2 lb chicken thighs")
    await gatherNow(database, jobs)

    const sent = await pantryChanges(() =>
      kyle.delete(`/api/pantry/items/${chicken.id}`)
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ usedUp: 1, removed: 0 })
  })

  test("Used up on two at once is one event with the total", async () => {
    await clearAll()
    const chicken = await add("2 lb chicken thighs")
    const milk = await add("milk")
    await gatherNow(database, jobs)

    const sent = await pantryChanges(() =>
      kyle.post("/api/pantry/items/bulk", {
        ids: [chicken.id, milk.id],
        action: "remove",
      })
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ usedUp: 2, removed: 0 })
  })

  test("moving several counts only what really moved", async () => {
    await clearAll()
    const chicken = await add("2 lb chicken thighs")
    const milk = await add("milk")
    const peas = await add("frozen peas")
    expect(peas.storedIn).toBe("freezer")
    await gatherNow(database, jobs)

    const sent = await pantryChanges(() =>
      kyle.post("/api/pantry/items/bulk", {
        ids: [chicken.id, milk.id, peas.id],
        action: "storedIn",
        storedIn: "freezer",
      })
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ moved: 2, changed: 0 })
  })

  test("giving several a use-by date changes them", async () => {
    await clearAll()
    const chicken = await add("2 lb chicken thighs")
    const milk = await add("milk")
    await gatherNow(database, jobs)

    const sent = await pantryChanges(() =>
      kyle.post("/api/pantry/items/bulk", {
        ids: [chicken.id, milk.id],
        action: "useBy",
        useBy: "2099-01-01",
      })
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ moved: 0, changed: 2 })
  })

  test("Clear the pantry takes everything out", async () => {
    await clearAll()
    await add("2 lb chicken thighs")
    await add("milk")
    await add("rice")
    await gatherNow(database, jobs)

    const sent = await pantryChanges(() => kyle.post("/api/pantry/clear"))

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ removed: 3, usedUp: 0 })
  })

  test("Undo of Used up puts it back", async () => {
    await clearAll()
    const chicken = await add("2 lb chicken thighs")
    const gone = await (
      await kyle.delete(`/api/pantry/items/${chicken.id}`)
    ).json()
    await gatherNow(database, jobs)

    const sent = await pantryChanges(async () => {
      const res = await kyle.post("/api/pantry/restore", { items: [gone] })
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ added: 1, moved: 0, changed: 0 })
  })

  test("Undo of a move moves them back, adding nothing", async () => {
    await clearAll()
    const chicken = await add("2 lb chicken thighs")
    const milk = await add("milk")
    const moved = await (
      await kyle.post("/api/pantry/items/bulk", {
        ids: [chicken.id, milk.id],
        action: "storedIn",
        storedIn: "freezer",
      })
    ).json()
    await gatherNow(database, jobs)

    const sent = await pantryChanges(async () => {
      const res = await kyle.post("/api/pantry/restore", {
        items: moved.before,
      })
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ added: 0, moved: 2, changed: 0 })
  })

  test("putting the shopping away puts it in the pantry", async () => {
    await clearAll()
    // So checking off doesn't put things away first.
    await kyle.patch("/api/households/current", { putAwayWhenChecked: false })
    try {
      for (const text of ["milk", "2 lb chicken thighs"]) {
        const res = await kyle.post("/api/list/items", { text })
        const item = (await res.json()) as { id: string }
        await kyle.patch(`/api/list/items/${item.id}`, { checked: true })
      }
      await gatherNow(database, jobs)

      const sent = await pantryChanges(async () => {
        const res = await kyle.post("/api/list/put-away", {})
        expect(res.status, await res.clone().text()).toBe(200)
      })

      expect(sent).toHaveLength(1)
      expect(sent[0]).toMatchObject({ added: 2 })
    } finally {
      await kyle.patch("/api/households/current", { putAwayWhenChecked: true })
    }
  })

  test("adding a receipt puts what's picked in the pantry", async () => {
    await clearAll()
    // As a receipt is once it's read, without asking a model to read it.
    const em = forHousehold(database.em.fork(), home)
    const receipt = em.create(Receipt, {
      household: home,
      store: "Walmart",
      date: today,
      total: 12.65,
      lines: [
        {
          id: "milk",
          text: "GV WHL MLK 1GAL",
          name: "whole milk",
          amount: "1 gal",
          price: 3.48,
          kind: "food",
          listItem: null,
        },
        {
          id: "chicken",
          text: "BNLS SKNLS CHKN THGH",
          name: "chicken thighs",
          amount: "2.3 lb",
          price: 9.17,
          kind: "food",
          listItem: null,
        },
      ],
      files: [],
    })
    await em.flush()

    const sent = await pantryChanges(async () => {
      const res = await kyle.post(`/api/pantry/receipts/${receipt.id}/add`, {
        items: [
          { id: "milk", name: "whole milk", amount: "1 gallon" },
          { id: "chicken", name: "chicken thighs", amount: "2.3 lb" },
        ],
      })
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ added: 2 })
  })

  test("Ran out uses it up", async () => {
    await clearAll()
    await add("4 lemons")
    const meal = await planLemonChicken()
    await setStatus(meal.id, "cooked")
    const foods = (
      await (await kyle.get(`/api/pantry/ran-out?meal=${meal.id}`)).json()
    ).foods as { food: string; name: string }[]
    const lemons = foods.find((food) => food.name.includes("lemon"))!
    await gatherNow(database, jobs)

    const sent = await pantryChanges(async () => {
      const res = await kyle.post("/api/pantry/ran-out", {
        meal: meal.id,
        foods: [lemons.food],
        list: true,
      })
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ usedUp: 1 })
  })

  test("not at home after all takes it out", async () => {
    await clearAll()
    const chicken = await add("2 lb chicken thighs")
    await gatherNow(database, jobs)

    const sent = await pantryChanges(async () => {
      const res = await kyle.post(
        `/api/list/covered/${chicken.id}/not-at-home`,
        {}
      )
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ usedUp: 0, removed: 1 })
  })

  test("cooking a planned meal uses up what it takes, and un-cooking puts it back", async () => {
    await clearAll()
    // All of the chicken, and some of the lemons.
    await add("2 lb chicken thighs")
    await add("4 lemons")
    const meal = await planLemonChicken()
    await gatherNow(database, jobs)

    const cooked = await pantryChanges(() => setStatus(meal.id, "cooked"))
    expect(cooked).toHaveLength(1)
    expect(cooked[0]).toMatchObject({ usedUp: 2, removed: 0 })

    // The chicken comes back, and the lemons are added to.
    const uncooked = await pantryChanges(() => setStatus(meal.id, "planned"))
    expect(uncooked).toHaveLength(1)
    expect(uncooked[0]).toMatchObject({ added: 1, changed: 1, usedUp: 0 })
  })
})
