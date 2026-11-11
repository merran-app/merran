import { addDays, clockIn, foodKey, weekStartOf } from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { Purchase } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { forHousehold } from "../../../database/scope.ts"
import {
  createTestApp,
  setUpServer,
  TEST_ORIGIN,
  type TestClient,
} from "../../../test/app.ts"
import {
  eventsFrom,
  gatherNow,
  listenToEverything,
  type SentEvent,
} from "../../../test/webhooks.ts"
import type { JobRunner } from "../../jobs/runner.ts"

// list.changed: everything put on the list, changed on it and taken off,
// whatever did it, gathered into one event for each person. Checking off
// is told in its own tests.

let app: App
let database: Database
let jobs: JobRunner
let close: () => Promise<void>
let kyle: TestClient
let home: string
let main: string
let costco: string
let today: string
/** Next week's Monday, so nothing's in the past. */
let monday: string

type Item = { id: string; name: string; list: string }

const TACOS = {
  name: "Beef Tacos",
  ingredients: ["1 lb ground beef", "8 corn tortillas", "2 limes"],
}

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, database, jobs, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  home = (
    await (
      await kyle.patch("/api/households/current", {
        timeZone: "UTC",
        weekStartsOn: 1,
        country: "GB",
      })
    ).json()
  ).id
  today = clockIn("UTC").today
  monday = addDays(weekStartOf(today, 1), 7)

  const recipe = await kyle.post("/api/recipes", {
    servings: 4,
    steps: ["Cook it."],
    ...TACOS,
  })
  expect(recipe.status, await recipe.clone().text()).toBe(201)

  main = (await (await kyle.get("/api/list")).json()).lists[0].id
  const saved = await kyle.put("/api/list/lists", {
    lists: [
      { id: main, name: "Shopping list", aisles: [] },
      { name: "Costco", aisles: [] },
    ],
  })
  expect(saved.status, await saved.clone().text()).toBe(200)
  costco = (await saved.json()).lists.find(
    (list: { name: string }) => list.name === "Costco"
  ).id

  await listenToEverything(kyle)
})

afterAll(() => close())

async function type(text: string) {
  const res = await kyle.post("/api/list/items", { text })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as Item
}

/** Tacos planned on Wednesday next week. */
async function planTacos() {
  const res = await kyle.post("/api/plan/entries", {
    date: addDays(monday, 2),
    meal: "dinner",
    recipe: "beef-tacos",
  })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as { id: string }
}

/** Next week's meals onto the list. */
async function fromPlan() {
  const res = await kyle.post("/api/list/from-plan", {
    from: monday,
    to: addDays(monday, 6),
  })
  expect(res.status, await res.clone().text()).toBe(200)
  return (await res.json()) as { added: number; merged: number }
}

/** The list and the plan emptied, and what that gathered let go. */
async function clearAll() {
  await kyle.post("/api/list/clear", { which: "all" })
  const entries = (
    await (
      await kyle.get(`/api/plan?from=${monday}&to=${addDays(monday, 6)}`)
    ).json()
  ).entries as { id: string }[]
  if (entries.length > 0) {
    await kyle.post("/api/plan/entries/bulk", {
      ids: entries.map((entry) => entry.id),
      action: "remove",
    })
  }
  await gatherNow(database, jobs)
}

/** The list.changed events an action sends once they're gathered. */
async function listChanges(action: () => Promise<unknown>) {
  const sent = await eventsFrom(database, home, async () => {
    await action()
    await gatherNow(database, jobs)
  })
  return sent.filter((event) => event.type === "list.changed")
}

describe("list.changed", () => {
  test("typing something in tells webhooks, with what's left", async () => {
    await clearAll()

    const sent = await listChanges(() => type("2 lb ground beef"))

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: "list.changed",
      lists: [{ id: main, name: "Shopping list", left: 1, checked: 0 }],
      added: 1,
      checked: 0,
      unchecked: 0,
      changed: 0,
      removed: 0,
      by: { name: "Kyle" },
      via: "app",
      key: null,
    })
  })

  test("what's added into a line that's there changes it", async () => {
    await clearAll()
    await type("1 lb ground beef")
    await planTacos()
    await gatherNow(database, jobs)

    let added: { added: number; merged: number } | undefined
    const sent = await listChanges(async () => {
      added = await fromPlan()
    })

    expect(added).toMatchObject({ added: 2, merged: 1 })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ added: 2, changed: 1, removed: 0 })
  })

  test("editing an amount is a change", async () => {
    await clearAll()
    const beef = await type("2 lb ground beef")
    await gatherNow(database, jobs)

    const sent = await listChanges(() =>
      kyle.patch(`/api/list/items/${beef.id}`, { amount: "3 lb" })
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      lists: [{ id: main, left: 1 }],
      added: 0,
      changed: 1,
    })
  })

  test("sending the same again changes nothing", async () => {
    await clearAll()
    const beef = await type("2 lb ground beef")
    await gatherNow(database, jobs)

    const sent = await listChanges(() =>
      kyle.patch(`/api/list/items/${beef.id}`, {
        name: "ground beef",
        amount: "2 lb",
      })
    )

    expect(sent).toEqual([])
  })

  // Moving a food remembers its list for next time, so each test of moving
  // moves foods of its own.

  test("moving a line to another list gives both lists", async () => {
    await clearAll()
    const bananas = await type("bananas")
    await gatherNow(database, jobs)

    const sent = await listChanges(() =>
      kyle.patch(`/api/list/items/${bananas.id}`, { list: costco })
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]!.lists).toEqual(
      expect.arrayContaining([
        { id: main, name: "Shopping list", left: 0, checked: 0 },
        { id: costco, name: "Costco", left: 1, checked: 0 },
      ])
    )
    expect(sent[0]).toMatchObject({ changed: 1 })
  })

  test("moving several to another list is one change of each", async () => {
    await clearAll()
    const apples = await type("apples")
    const pears = await type("pears")
    await gatherNow(database, jobs)

    const sent = await listChanges(() =>
      kyle.post("/api/list/items/bulk", {
        ids: [apples.id, pears.id],
        action: "move",
        list: costco,
      })
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]!.lists).toHaveLength(2)
    expect(sent[0]).toMatchObject({ changed: 2 })
  })

  test("taking one off tells webhooks", async () => {
    await clearAll()
    const beef = await type("2 lb ground beef")
    await type("paper towels")
    await gatherNow(database, jobs)

    const sent = await listChanges(() =>
      kyle.delete(`/api/list/items/${beef.id}`)
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      lists: [{ id: main, left: 1 }],
      removed: 1,
    })
  })

  test("taking three off at once is one event with the total", async () => {
    await clearAll()
    const items = [
      await type("2 lb ground beef"),
      await type("paper towels"),
      await type("milk"),
    ]
    await gatherNow(database, jobs)

    const sent = await listChanges(() =>
      kyle.post("/api/list/items/bulk", {
        ids: items.map((item) => item.id),
        action: "remove",
      })
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      lists: [{ id: main, left: 0 }],
      removed: 3,
    })
  })

  test("Clear the list takes everything off every list", async () => {
    await clearAll()
    const bread = await type("bread")
    await type("paper towels")
    await kyle.patch(`/api/list/items/${bread.id}`, { list: costco })
    await gatherNow(database, jobs)

    const sent = await listChanges(() =>
      kyle.post("/api/list/clear", { which: "all" })
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]!.lists).toHaveLength(2)
    expect(sent[0]).toMatchObject({ removed: 2 })
  })

  test("putting things away takes them off", async () => {
    await clearAll()
    for (const text of ["milk", "paper towels"]) {
      const item = await type(text)
      await kyle.patch(`/api/list/items/${item.id}`, { checked: true })
    }
    await type("butter")
    await gatherNow(database, jobs)

    const sent = await listChanges(async () => {
      const res = await kyle.post("/api/list/put-away", {})
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      lists: [{ id: main, left: 1, checked: 0 }],
      removed: 2,
    })
  })

  test("adding from the plan says how many lines it made", async () => {
    await clearAll()
    await planTacos()
    await gatherNow(database, jobs)

    let added: { added: number } | undefined
    const sent = await listChanges(async () => {
      added = await fromPlan()
    })

    expect(added!.added).toBe(3)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ added: 3, changed: 0 })
  })

  test("taking a meal off the plan takes its share off the list", async () => {
    await clearAll()
    const tacos = await planTacos()
    await fromPlan()
    await gatherNow(database, jobs)

    const sent = await listChanges(() =>
      kyle.delete(`/api/plan/entries/${tacos.id}`)
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ added: 0, removed: 3 })
  })

  test("adding usual buys tells webhooks", async () => {
    await clearAll()
    // Every week, last a week ago: due yesterday.
    const em = forHousehold(database.em.fork(), home)
    for (const daysAgo of [21, 14, 7]) {
      em.create(Purchase, {
        household: home,
        foodKey: foodKey("eggs"),
        name: "eggs",
        amountText: "a dozen",
        boughtOn: addDays(today, -daysAgo),
      })
    }
    await em.flush()

    const sent = await listChanges(async () => {
      const res = await kyle.post("/api/list/usual/add", { foods: ["egg"] })
      expect(res.status, await res.clone().text()).toBe(201)
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ added: 1 })
  })

  test("Undo of taking one off adds it back", async () => {
    await clearAll()
    const towels = await type("paper towels")
    const removed = await kyle.delete(`/api/list/items/${towels.id}`)
    const before = await removed.json()
    await gatherNow(database, jobs)

    const sent = await listChanges(async () => {
      const res = await kyle.post("/api/list/restore", { items: [before] })
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      lists: [{ id: main, left: 1 }],
      added: 1,
      removed: 0,
    })
  })

  test("an AI app's list proposal is added by whoever applies it", async () => {
    await clearAll()
    const made = await kyle.post("/api/auth/api-keys", {
      name: "Claude Desktop",
      permissions: { list: "write" },
      expiresInDays: 90,
    })
    expect(made.status).toBe(201)
    const { key } = await made.json()
    const response = await app.request(`${TEST_ORIGIN}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "propose_list_items",
          arguments: { summary: "Get milk", items: ["2 litres milk"] },
        },
      }),
    })
    expect(response.status).toBe(200)
    const text = await response.text()
    const result = JSON.parse(
      text.startsWith("event:")
        ? text
            .split("\n")
            .find((line) => line.startsWith("data: "))!
            .slice(6)
        : text
    )
    const { proposal } = JSON.parse(result.result.content[0].text)
    await gatherNow(database, jobs)

    const sent = await listChanges(async () => {
      const res = await kyle.post(`/api/proposals/${proposal.id}/apply`, {})
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      added: 1,
      by: { name: "Kyle" },
      via: "app",
      key: null,
    })
  })
})

describe("checking off", () => {
  async function check(id: string, checked = true) {
    const res = await kyle.patch(`/api/list/items/${id}`, { checked })
    expect(res.status, await res.clone().text()).toBe(200)
  }

  async function bulk(ids: string[], action: "check" | "uncheck") {
    const res = await kyle.post("/api/list/items/bulk", { ids, action })
    expect(res.status, await res.clone().text()).toBe(200)
  }

  async function putAway() {
    const res = await kyle.post("/api/list/put-away", {})
    expect(res.status, await res.clone().text()).toBe(200)
  }

  /** Everything sent by doing something, gathered changes merged. */
  async function sentBy(action: () => Promise<unknown>) {
    return eventsFrom(database, home, async () => {
      await action()
      await gatherNow(database, jobs)
    })
  }

  const ofType = (events: SentEvent[], type: string) =>
    events.filter((event) => event.type === type)

  test("checking things off is gathered", async () => {
    await clearAll()
    const items = [
      await type("milk"),
      await type("rye"),
      await type("butter"),
      await type("eggs"),
      await type("jam"),
      await type("tea"),
    ]
    await gatherNow(database, jobs)

    const sent = await sentBy(async () => {
      for (const item of items.slice(0, 3)) await check(item.id)
      await bulk([items[3]!.id, items[4]!.id], "check")
    })

    const changes = ofType(sent, "list.changed")
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      lists: [{ id: main, left: 1, checked: 5 }],
      checked: 5,
      unchecked: 0,
    })

    const unchecked = await sentBy(() => check(items[0]!.id, false))
    expect(ofType(unchecked, "list.changed")).toEqual([
      expect.objectContaining({ checked: 0, unchecked: 1 }),
    ])
  })

  test("checking off the last thing finishes the list", async () => {
    await clearAll()
    const milk = await type("milk")
    const bread = await type("rye")
    await check(milk.id)
    await gatherNow(database, jobs)

    // Before any merge: it's sent at once, not gathered.
    const sent = await eventsFrom(database, home, () => check(bread.id))

    expect(ofType(sent, "list.completed")).toEqual([
      expect.objectContaining({
        list: { id: main, name: "Shopping list" },
        bought: 2,
        left: 0,
        by: { id: expect.any(String), name: "Kyle" },
        via: "app",
      }),
    ])
  })

  test("checking off a thing with others left doesn't finish it", async () => {
    await clearAll()
    const milk = await type("milk")
    await type("rye")
    await gatherNow(database, jobs)

    const sent = await sentBy(() => check(milk.id))

    expect(ofType(sent, "list.completed")).toEqual([])
  })

  test("a bulk check that finishes two lists finishes both", async () => {
    await clearAll()
    const milk = await type("milk")
    const rice = await type("rice")
    const flour = await type("flour")
    await kyle.patch(`/api/list/items/${rice.id}`, { list: costco })
    await kyle.patch(`/api/list/items/${flour.id}`, { list: costco })
    await gatherNow(database, jobs)

    const sent = await sentBy(() => bulk([milk.id, rice.id, flour.id], "check"))

    const done = ofType(sent, "list.completed")
    expect(done).toHaveLength(2)
    expect(done).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          list: { id: main, name: "Shopping list" },
          bought: 1,
          left: 0,
        }),
        expect.objectContaining({
          list: { id: costco, name: "Costco" },
          bought: 2,
          left: 0,
        }),
      ])
    )
    expect(ofType(sent, "list.changed")).toHaveLength(1)
  })

  test("one trip sends one list.completed", async () => {
    // Finished by the last check, so putting it away adds nothing.
    await clearAll()
    const milk = await type("milk")
    const bread = await type("rye")
    await check(milk.id)
    await gatherNow(database, jobs)
    const finished = await sentBy(async () => {
      await check(bread.id)
      await putAway()
    })
    expect(ofType(finished, "list.completed")).toHaveLength(1)

    // Put away with two things left unchecked: that ends the trip.
    await clearAll()
    const eggs = await type("eggs")
    const jam = await type("jam")
    await type("tea")
    await type("honey")
    await check(eggs.id)
    await check(jam.id)
    await gatherNow(database, jobs)
    const left = await sentBy(putAway)
    expect(ofType(left, "list.completed")).toEqual([
      expect.objectContaining({
        list: { id: main, name: "Shopping list" },
        bought: 2,
        left: 2,
      }),
    ])
  })

  test("Undo never finishes a list", async () => {
    await clearAll()
    const milk = await type("milk")
    await check(milk.id)
    // What Undo of taking it off would send back: checked.
    const removed = await kyle.delete(`/api/list/items/${milk.id}`)
    const snapshot = await removed.json()
    expect(snapshot.checked).toBe(true)
    await kyle.post("/api/list/restore", { items: [snapshot] })
    await check(milk.id, false)
    await gatherNow(database, jobs)

    // Undo checks it again, and that was the last thing on the list.
    const sent = await sentBy(async () => {
      const res = await kyle.post("/api/list/restore", {
        items: [snapshot],
      })
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(ofType(sent, "list.completed")).toEqual([])
    expect(ofType(sent, "list.changed")).toEqual([
      expect.objectContaining({ checked: 1 }),
    ])
  })

  test("checking off puts things away, and unchecking takes them back", async () => {
    // The household puts things away when they're checked off, as it does
    // unless someone turns it off.
    await clearAll()
    await kyle.post("/api/pantry/clear")
    const milk = await type("milk")
    await gatherNow(database, jobs)

    const checked = await sentBy(() => check(milk.id))
    expect(ofType(checked, "pantry.changed")).toEqual([
      expect.objectContaining({ added: 1, removed: 0 }),
    ])

    const unchecked = await sentBy(() => check(milk.id, false))
    expect(ofType(unchecked, "pantry.changed")).toEqual([
      expect.objectContaining({ added: 0, removed: 1 }),
    ])
  })
})
