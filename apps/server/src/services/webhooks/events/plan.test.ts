import { addDays, autoplanWeek, clockIn, weekStartOf } from "@merran/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { Household, Job } from "../../../database/entities/index.ts"
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
import { AUTOPLAN_JOB } from "../../plan/autoplan.ts"
import type { EntrySnapshot } from "../../plan/snapshots.ts"
import { planChange } from "./plan.ts"

// plan.changed: every add, move and removal on the plan, whatever did it,
// gathered into one event for each person. plan.autoplanned: the autoplan
// planned a week.

const DAY = "2026-10-14"
const OTHER_DAY = "2026-10-15"
const WEEK = "2026-10-12"

/** A meal as the plan snapshots it: dinner on DAY, a soup. */
const meal = (id: string, changes: Partial<EntrySnapshot> = {}) =>
  ({
    id,
    date: DAY,
    anyDay: false,
    meal: "dinner",
    position: 0,
    status: "planned",
    recipe: "soup",
    withRecipe: null,
    note: null,
    servings: null,
    listedAt: null,
    why: null,
    cookedAt: null,
    variants: [],
    ...changes,
  }) satisfies EntrySnapshot

describe("planChange", () => {
  const cases: {
    name: string
    before: EntrySnapshot[]
    after: EntrySnapshot[]
    expected: ReturnType<typeof planChange>
  }[] = [
    {
      name: "an add",
      before: [],
      after: [meal("a")],
      expected: { days: [DAY], added: 1 },
    },
    {
      name: "a remove",
      before: [meal("a")],
      after: [],
      expected: { days: [DAY], removed: 1 },
    },
    {
      name: "a move to another day, which gives both days",
      before: [meal("a")],
      after: [meal("a", { date: OTHER_DAY })],
      expected: { days: [DAY, OTHER_DAY], moved: 1 },
    },
    {
      name: "a move into the pool, which gives the day and the week",
      before: [meal("a")],
      after: [meal("a", { date: WEEK, anyDay: true })],
      expected: { days: [DAY], pools: [WEEK], moved: 1 },
    },
    {
      name: "a move to another meal",
      before: [meal("a")],
      after: [meal("a", { meal: "lunch" })],
      expected: { days: [DAY], moved: 1 },
    },
    {
      name: "a reorder",
      before: [meal("a"), meal("b", { position: 1 })],
      after: [meal("a", { position: 1 }), meal("b")],
      expected: { days: [DAY], moved: 2 },
    },
    {
      name: "a recipe swap",
      before: [meal("a")],
      after: [meal("a", { recipe: "bread" })],
      expected: { days: [DAY], changed: 1 },
    },
    {
      name: "a servings change",
      before: [meal("a")],
      after: [meal("a", { servings: 6 })],
      expected: { days: [DAY], changed: 1 },
    },
    {
      name: "a changed side",
      before: [meal("a")],
      after: [meal("a", { withRecipe: "rice" })],
      expected: { days: [DAY], changed: 1 },
    },
    {
      name: "a note turned into another",
      before: [meal("a", { recipe: null, note: "Pizza" })],
      after: [meal("a", { recipe: null, note: "Tacos" })],
      expected: { days: [DAY], changed: 1 },
    },
    {
      name: "a change to a dish's version",
      before: [meal("a")],
      after: [
        meal("a", {
          variants: [{ recipeId: "soup", variant: "spicy" }] as never,
        }),
      ],
      expected: { days: [DAY], changed: 1 },
    },
    {
      name: "a move that also changes the recipe, which counts as a move",
      before: [meal("a")],
      after: [meal("a", { date: OTHER_DAY, recipe: "bread" })],
      expected: { days: [DAY, OTHER_DAY], moved: 1 },
    },
    {
      name: "a status-only change, which counts nothing",
      before: [meal("a")],
      after: [
        meal("a", {
          status: "cooked",
          cookedAt: "2026-10-14T18:00:00.000Z",
          listedAt: "2026-10-13T10:00:00.000Z",
          why: [],
        }),
      ],
      expected: {},
    },
  ]

  test.each(cases)("$name", ({ before, after, expected }) => {
    expect(planChange(before, after)).toEqual(expected)
  })

  test("a batch counts each meal once, and each day once", () => {
    expect(
      planChange(
        [meal("a"), meal("b", { position: 1 }), meal("c", { date: OTHER_DAY })],
        [meal("a"), meal("d", { position: 1 }), meal("e", { date: OTHER_DAY })]
      )
    ).toEqual({ days: [DAY, OTHER_DAY], added: 2, removed: 2 })
  })
})

let app: App
let database: Database
let jobs: JobRunner
let close: () => Promise<void>
let kyle: TestClient
let home: string
let today: string
let week: string
let ahead: string

const DINNERS = [
  "Lemon Chicken",
  "Beef Tacos",
  "Mushroom Risotto",
  "Salmon Bake",
  "Veggie Curry",
  "Pork Chops",
  "Shrimp Pasta",
  "Tomato Soup",
  "Soda Bread",
  "Garlic Rice",
]

beforeAll(async () => {
  const test = await createTestApp({ publicUrl: "http://merran.test" })
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
  week = weekStartOf(today, 1)
  ahead = autoplanWeek(today, 1)
  for (const name of DINNERS) {
    const res = await kyle.post("/api/recipes", {
      name,
      servings: 4,
      ingredients: ["1 onion"],
      steps: ["Cook it."],
    })
    expect(res.status, await res.clone().text()).toBe(201)
  }
  await listenToEverything(kyle)
})

afterAll(() => close())

async function add(body: Record<string, unknown>) {
  const res = await kyle.post("/api/plan/entries", body)
  expect(res.status, await res.clone().text()).toBe(201)
  return res.json()
}

/** The plan from a week before this one to two weeks after. */
const plan = async () =>
  (
    await (
      await kyle.get(
        `/api/plan?from=${addDays(week, -7)}&to=${addDays(week, 20)}`
      )
    ).json()
  ).entries as { id: string }[]

/** Takes everything off the plan, and lets what that gathered go. */
async function clearAll() {
  const ids = (await plan()).map((entry) => entry.id)
  if (ids.length > 0) {
    await kyle.post("/api/plan/entries/bulk", { ids, action: "remove" })
  }
  await gatherNow(database, jobs)
}

/** The plan.changed events an action sends once they're gathered. */
async function planChanges(action: () => Promise<unknown>) {
  const sent = await eventsFrom(database, home, async () => {
    await action()
    await gatherNow(database, jobs)
  })
  return sent.filter((event) => event.type === "plan.changed")
}

describe("plan.changed", () => {
  test("adding a meal tells webhooks which day", async () => {
    await clearAll()

    const sent = await planChanges(() =>
      add({ date: today, meal: "dinner", recipe: "tomato-soup" })
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: "plan.changed",
      days: [today],
      pools: [],
      added: 1,
      moved: 0,
      changed: 0,
      removed: 0,
      by: { name: "Kyle" },
      via: "app",
    })
  })

  test("adding a batch is one event with the totals", async () => {
    await clearAll()

    const sent = await planChanges(async () => {
      const res = await kyle.post("/api/plan/entries/batch", {
        entries: [
          { date: today, meal: "dinner", recipe: "tomato-soup" },
          { date: addDays(today, 1), meal: "dinner", recipe: "soda-bread" },
          { date: week, meal: "dinner", anyDay: true, note: "Tacos" },
        ],
      })
      expect(res.status, await res.clone().text()).toBe(201)
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      days: [today, addDays(today, 1)].sort(),
      pools: [week],
      added: 3,
    })
  })

  test("moving a meal gives both days", async () => {
    await clearAll()
    const soup = await add({
      date: today,
      meal: "dinner",
      recipe: "tomato-soup",
    })
    await gatherNow(database, jobs)
    const later = addDays(today, 2)

    const sent = await planChanges(() =>
      kyle.patch(`/api/plan/entries/${soup.id}`, { date: later })
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      days: [today, later].sort(),
      added: 0,
      moved: 1,
      removed: 0,
    })
  })

  test("swapping a meal's recipe is a change", async () => {
    await clearAll()
    const soup = await add({
      date: today,
      meal: "dinner",
      recipe: "tomato-soup",
    })
    await gatherNow(database, jobs)

    const sent = await planChanges(() =>
      kyle.patch(`/api/plan/entries/${soup.id}`, { recipe: "soda-bread" })
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ days: [today], changed: 1, moved: 0 })
  })

  test("only marking a meal cooked sends no plan.changed", async () => {
    await clearAll()
    const soup = await add({
      date: today,
      meal: "dinner",
      recipe: "tomato-soup",
    })
    await gatherNow(database, jobs)

    const sent = await planChanges(async () => {
      const res = await kyle.patch(`/api/plan/entries/${soup.id}`, {
        status: "cooked",
      })
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(sent).toEqual([])
  })

  test("removing a meal tells webhooks which day", async () => {
    await clearAll()
    const soup = await add({
      date: today,
      meal: "dinner",
      recipe: "tomato-soup",
    })
    await gatherNow(database, jobs)

    const sent = await planChanges(() =>
      kyle.delete(`/api/plan/entries/${soup.id}`)
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ days: [today], added: 0, removed: 1 })
  })

  test("a bulk swap moves both meals", async () => {
    await clearAll()
    const soup = await add({
      date: today,
      meal: "dinner",
      recipe: "tomato-soup",
    })
    const bread = await add({
      date: addDays(today, 3),
      meal: "lunch",
      recipe: "soda-bread",
    })
    await gatherNow(database, jobs)

    const sent = await planChanges(() =>
      kyle.post("/api/plan/entries/bulk", {
        ids: [soup.id, bread.id],
        action: "swap",
      })
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      days: [today, addDays(today, 3)].sort(),
      moved: 2,
      added: 0,
    })
  })

  test("Undo of a bulk remove says the meals were added back", async () => {
    await clearAll()
    const soup = await add({
      date: today,
      meal: "dinner",
      recipe: "tomato-soup",
    })
    const bread = await add({
      date: addDays(today, 1),
      meal: "dinner",
      recipe: "soda-bread",
    })
    await gatherNow(database, jobs)
    const removed = await kyle.post("/api/plan/entries/bulk", {
      ids: [soup.id, bread.id],
      action: "remove",
    })
    const { before } = await removed.json()
    await gatherNow(database, jobs)

    const sent = await planChanges(async () => {
      const res = await kyle.post("/api/plan/restore", { entries: before })
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ added: 2, moved: 0, removed: 0 })
  })

  test("Repeat last week tells webhooks what it copied", async () => {
    await clearAll()
    const last = addDays(week, -7)
    await add({ date: last, meal: "dinner", recipe: "tomato-soup" })
    await add({ date: addDays(last, 1), meal: "dinner", note: "Pizza out" })
    await gatherNow(database, jobs)

    const sent = await planChanges(async () => {
      const res = await kyle.post("/api/plan/repeat", { week })
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      days: [week, addDays(week, 1)],
      added: 2,
    })
  })

  test("Clear tells webhooks what it took off", async () => {
    await clearAll()
    const next = addDays(week, 7)
    await add({ date: next, meal: "dinner", recipe: "tomato-soup" })
    await add({ date: next, meal: "dinner", anyDay: true, note: "Tacos" })
    await gatherNow(database, jobs)

    const sent = await planChanges(async () => {
      const res = await kyle.post("/api/plan/clear", { week: next })
      expect(res.status, await res.clone().text()).toBe(200)
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      days: [next],
      pools: [next],
      removed: 2,
    })
  })

  test("making a recipe that isn't planned adds a meal", async () => {
    await clearAll()

    const sent = await planChanges(async () => {
      const res = await kyle.post("/api/recipes/tomato-soup/made", {})
      expect(res.status, await res.clone().text()).toBeLessThan(300)
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ days: [today], added: 1, moved: 0 })
  })

  test("making a recipe from the pool moves it to today", async () => {
    await clearAll()
    await add({
      date: week,
      meal: "dinner",
      anyDay: true,
      recipe: "tomato-soup",
    })
    await gatherNow(database, jobs)

    const sent = await planChanges(async () => {
      const res = await kyle.post("/api/recipes/tomato-soup/made", {})
      expect(res.status, await res.clone().text()).toBeLessThan(300)
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      days: [today],
      pools: [week],
      moved: 1,
      added: 0,
    })
  })

  test("making a recipe that's planned for today sends nothing", async () => {
    await clearAll()
    await add({ date: today, meal: "dinner", recipe: "tomato-soup" })
    await gatherNow(database, jobs)

    const sent = await planChanges(async () => {
      const res = await kyle.post("/api/recipes/tomato-soup/made", {})
      expect(res.status, await res.clone().text()).toBeLessThan(300)
    })

    expect(sent).toEqual([])
  })
})

describe("plan.autoplanned", () => {
  const settings = {
    enabled: true,
    day: 6,
    hour: 9,
    meals: ["dinner"],
    addToList: false,
  }

  /** As if the autoplan's time had come today, for a week it hasn't planned. */
  async function timeComes() {
    const em = forHousehold(database.em.fork(), home)
    const household = await em.findOneOrFail(Household, { id: home })
    household.settings = {
      ...household.settings,
      autoplan: { ...household.settings!.autoplan!, last: null },
    }
    await em.flush()
    for (const job of await em.find(Job, {
      kind: AUTOPLAN_JOB,
      forHousehold: home,
      status: "queued",
    })) {
      job.runAt = new Date(Date.now() - 1000)
      job.key = `${job.key}:now`
      job.payload = { at: `${today}T09:00:00.000Z` }
    }
    await em.flush()
    await jobs.drain()
  }

  test("running it by hand tells webhooks the week and who ran it", async () => {
    await clearAll()
    await kyle.put("/api/plan/autoplan", { ...settings, enabled: false })

    const sent = await eventsFrom(database, home, async () => {
      const res = await kyle.post("/api/plan/autoplan/run")
      expect(res.status, await res.clone().text()).toBe(200)
      const run = await res.json()
      expect(run.planned).toBeGreaterThan(0)
      await gatherNow(database, jobs)
    })

    const autoplanned = sent.filter((e) => e.type === "plan.autoplanned")
    const changed = sent.filter((e) => e.type === "plan.changed")
    expect(autoplanned).toHaveLength(1)
    expect(autoplanned[0]).toMatchObject({
      week: ahead,
      by: { name: "Kyle" },
      via: "app",
      url: `http://merran.test/plan?week=${ahead}`,
    })
    expect(autoplanned[0]!.meals).toBeGreaterThan(0)
    // Its adds are plan changes too.
    expect(changed).toHaveLength(1)
    expect(changed[0]).toMatchObject({ added: autoplanned[0]!.meals })
  })

  test("on its schedule it's Merran's own work", async () => {
    await clearAll()
    await kyle.put("/api/plan/autoplan", settings)

    const sent = await eventsFrom(database, home, async () => {
      await timeComes()
      await gatherNow(database, jobs)
    })

    const autoplanned = sent.filter((e) => e.type === "plan.autoplanned")
    const changed = sent.filter((e) => e.type === "plan.changed")
    expect(autoplanned).toHaveLength(1)
    expect(autoplanned[0]).toMatchObject({ by: null, via: "merran" })
    expect(autoplanned[0]!.meals).toBeGreaterThan(0)
    expect(changed).toHaveLength(1)
    expect(changed[0]).toMatchObject({ added: autoplanned[0]!.meals })
    expect(changed[0]).toMatchObject({ by: null, via: "merran" })

    await kyle.put("/api/plan/autoplan", { ...settings, enabled: false })
  })
})
