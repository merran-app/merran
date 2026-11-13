import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { ShoppingItem } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { forHousehold } from "../../../database/scope.ts"
import {
  createTestApp,
  setUpServer,
  type TestClient,
} from "../../../test/app.ts"
import {
  eventsFrom,
  listenToEverything,
  type SentEvent,
} from "../../../test/webhooks.ts"
import { sendHeadsUps } from "./schedule.ts"

// The daily heads-ups, in a household in New York: the summary and what to
// use soon at its Daily summary at time, on its own clock across daylight
// saving changes, and each meal's "time to start". Each is sent once.
// The runs are given their moments, as the schedule would run them.

let app: App
let database: Database
let close: () => Promise<void>
let kyle: TestClient
let home: string

const SCHEDULE = "/api/households/current/webhooks/schedule"

beforeAll(async () => {
  const test = await createTestApp({ publicUrl: "http://merran.test" })
  ;({ app, database, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  const household = await kyle.patch("/api/households/current", {
    timeZone: "America/New_York",
    weekStartsOn: 1,
    country: "US",
  })
  home = (await household.json()).id

  await addRecipe({ name: "Lemon Chicken", totalMinutes: 45 })
  await addRecipe({ name: "Garlic Rice", prepMinutes: 5, cookMinutes: 20 })
  await addRecipe({ name: "Green Salad" })
  await addRecipe({ name: "Overnight Oats", totalMinutes: 600 })
  await addRecipe({ name: "Slow Stew", totalMinutes: 480 })
  await listenToEverything(kyle)
})

afterAll(() => close())

async function addRecipe(fields: Record<string, unknown>) {
  const res = await kyle.post("/api/recipes", {
    servings: 4,
    ingredients: ["1 onion"],
    steps: ["Cook it."],
    ...fields,
  })
  expect(res.status, await res.clone().text()).toBe(201)
}

async function plan(body: Record<string, unknown>) {
  const res = await kyle.post("/api/plan/entries", body)
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json()) as { id: string }
}

async function setSlotTime(date: string, meal: string, start: string) {
  const res = await kyle.put(`/api/plan/calendar/slots/${date}/${meal}`, {
    start,
    minutes: 45,
  })
  expect(res.status, await res.clone().text()).toBe(200)
}

/** What a run of the schedule sends, between two moments. */
function run(since: string, now: string): Promise<SentEvent[]> {
  return eventsFrom(database, home, () =>
    sendHeadsUps(database, { since: new Date(since), now: new Date(now) })
  )
}

const ofType = (events: SentEvent[], type: string) =>
  events.filter((event) => event.type === type)

describe("day.summary", () => {
  test("goes at the household's time, across daylight saving changes", async () => {
    // Saturday, March 13, 2027, on Eastern Standard Time: 07:00 is 12:00 UTC.
    expect(
      await run("2027-03-13T11:50:00.000Z", "2027-03-13T11:55:00.000Z")
    ).toEqual([])
    const saturday = await run(
      "2027-03-13T11:55:00.000Z",
      "2027-03-13T12:00:03.000Z"
    )
    expect(ofType(saturday, "day.summary")).toEqual([
      expect.objectContaining({
        date: "2027-03-13",
        by: null,
        via: "merran",
        key: null,
      }),
    ])
    // Run again over the same moments, or the next 5 minutes, it isn't sent again.
    expect(
      await run("2027-03-13T11:55:00.000Z", "2027-03-13T12:00:03.000Z")
    ).toEqual([])
    expect(
      await run("2027-03-13T12:00:03.000Z", "2027-03-13T12:05:00.000Z")
    ).toEqual([])

    // The clocks go forward that night: Sunday's 07:00 is 11:00 UTC.
    const sunday = await run(
      "2027-03-14T10:55:00.000Z",
      "2027-03-14T11:00:02.000Z"
    )
    expect(ofType(sunday, "day.summary").map((event) => event.date)).toEqual([
      "2027-03-14",
    ])
    expect(
      await run("2027-03-14T11:55:00.000Z", "2027-03-14T12:00:02.000Z")
    ).toEqual([])

    // And back on November 7, 2027: 07:00 is 12:00 UTC again.
    expect(
      await run("2027-11-07T10:55:00.000Z", "2027-11-07T11:00:02.000Z")
    ).toEqual([])
    const fallBack = await run(
      "2027-11-07T11:55:00.000Z",
      "2027-11-07T12:00:02.000Z"
    )
    expect(ofType(fallBack, "day.summary").map((event) => event.date)).toEqual([
      "2027-11-07",
    ])
  })

  test("a server that was off sends it when it's back, once", async () => {
    // The last run was the night before; the next comes at 09:30 there.
    const late = await run(
      "2027-11-08T03:00:00.000Z",
      "2027-11-08T14:30:00.000Z"
    )
    expect(ofType(late, "day.summary").map((event) => event.date)).toEqual([
      "2027-11-08",
    ])
    expect(
      await run("2027-11-08T14:30:00.000Z", "2027-11-08T14:35:00.000Z")
    ).toEqual([])

    // Off from before 07:00 on the 10th until 06:30 on the 12th: the 12th's
    // waits for its own time, rather than going early for a day gone by.
    expect(
      await run("2027-11-10T11:58:00.000Z", "2027-11-12T11:30:00.000Z")
    ).toEqual([])
    const onTime = await run(
      "2027-11-12T11:55:00.000Z",
      "2027-11-12T12:00:02.000Z"
    )
    expect(ofType(onTime, "day.summary").map((event) => event.date)).toEqual([
      "2027-11-12",
    ])
  })

  test("a time just before midnight goes with the first run after it", async () => {
    await kyle.put(SCHEDULE, { summaryAt: "23:58" })
    try {
      // 23:58 on November 13 there is 04:58 UTC on the 14th; the run after
      // it is past midnight, so it tells of the 14th.
      const sent = await run(
        "2027-11-14T04:55:00.000Z",
        "2027-11-14T05:00:03.000Z"
      )
      expect(ofType(sent, "day.summary").map((event) => event.date)).toEqual([
        "2027-11-14",
      ])
    } finally {
      await kyle.put(SCHEDULE, { summaryAt: "07:00" })
    }
  })

  test("goes at the time set as Daily summary at", async () => {
    expect(await (await kyle.get(SCHEDULE)).json()).toEqual({
      summaryAt: "07:00",
    })
    const wrong = await kyle.put(SCHEDULE, { summaryAt: "7am" })
    expect(wrong.status).toBe(400)

    const saved = await kyle.put(SCHEDULE, { summaryAt: "06:30" })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toEqual({ summaryAt: "06:30" })
    expect(await (await kyle.get(SCHEDULE)).json()).toEqual({
      summaryAt: "06:30",
    })

    try {
      // Tuesday, November 9, 2027: 06:30 is 11:30 UTC; 07:00 sends nothing.
      expect(
        await run("2027-11-09T11:55:00.000Z", "2027-11-09T12:00:02.000Z")
      ).toEqual([])
      const sent = await run(
        "2027-11-09T11:25:00.000Z",
        "2027-11-09T11:30:01.000Z"
      )
      expect(ofType(sent, "day.summary").map((event) => event.date)).toEqual([
        "2027-11-09",
      ])
    } finally {
      await kyle.put(SCHEDULE, { summaryAt: "07:00" })
    }
  })

  test("lists the day's meals with their times, the pool, what to use soon and the list", async () => {
    // Saturday, March 20, 2027. Lunch has its own time that day; dinner
    // keeps the household's usual 18:00.
    const day = "2027-03-20"
    await setSlotTime(day, "lunch", "12:30")
    const chicken = await plan({
      date: day,
      meal: "dinner",
      recipe: "lemon-chicken",
      withRecipe: "garlic-rice",
    })
    const salad = await plan({
      date: day,
      meal: "dinner",
      recipe: "green-salad",
    })
    const leftovers = await plan({
      date: day,
      meal: "lunch",
      note: "Leftovers",
    })
    const skipped = await plan({
      date: day,
      meal: "snack",
      recipe: "slow-stew",
    })
    const didnt = await kyle.patch(`/api/plan/entries/${skipped.id}`, {
      status: "skipped",
    })
    expect(didnt.status, await didnt.clone().text()).toBe(200)
    // Monday the 15th starts that week, and its pool.
    const pooled = await plan({
      date: day,
      anyDay: true,
      meal: "dinner",
      recipe: "slow-stew",
    })

    const spinach = await pantryItem("spinach", "fridge", "2027-03-21")
    await pantryItem("milk", "fridge", "2027-03-25")
    await pantryItem("rice", "cupboard", null)
    const items = await forHousehold(database.em, home).count(ShoppingItem, {
      checked: false,
    })

    const sent = await run(
      "2027-03-20T10:55:00.000Z",
      "2027-03-20T11:00:01.000Z"
    )
    const [summary] = ofType(sent, "day.summary")
    expect(summary).toEqual({
      type: "day.summary",
      household: { id: home, name: expect.any(String) },
      by: null,
      via: "merran",
      key: null,
      date: day,
      meals: [
        {
          meal: "lunch",
          time: "12:30",
          dishes: [
            {
              entryId: leftovers.id,
              title: "Leftovers",
              recipe: null,
              side: null,
              totalMinutes: null,
            },
          ],
        },
        {
          meal: "dinner",
          time: "18:00",
          dishes: [
            {
              entryId: chicken.id,
              title: "Lemon Chicken",
              recipe: {
                id: expect.any(String),
                slug: "lemon-chicken",
                title: "Lemon Chicken",
                url: "http://merran.test/recipes/lemon-chicken",
              },
              side: expect.objectContaining({ slug: "garlic-rice" }),
              totalMinutes: 45,
            },
            {
              entryId: salad.id,
              title: "Green Salad",
              recipe: expect.objectContaining({ slug: "green-salad" }),
              side: null,
              totalMinutes: null,
            },
          ],
        },
      ],
      pool: [
        expect.objectContaining({
          entryId: pooled.id,
          date: "2027-03-15",
          pool: true,
          title: "Slow Stew",
        }),
      ],
      useSoon: [
        {
          id: spinach.id,
          name: spinach.name,
          place: "fridge",
          useBy: "2027-03-21",
        },
      ],
      list: { items },
    })

    // The first "use soon" a webhook gets lists everything that's close.
    expect(ofType(sent, "pantry.use_soon")).toEqual([
      expect.objectContaining({
        items: [
          expect.objectContaining({ id: spinach.id, useBy: "2027-03-21" }),
        ],
      }),
    ])
  })
})

describe("meal.time_to_start", () => {
  test("goes when the longest dish needs starting, once, up to 15 minutes late", async () => {
    // Sunday, March 14, 2027, the day the clocks go forward. Dinner at the
    // usual 18:00: chicken (45 minutes) with rice (25), and a salad that
    // doesn't say. 17:15 there is 21:15 UTC.
    const day = "2027-03-14"
    const chicken = await plan({
      date: day,
      meal: "dinner",
      recipe: "lemon-chicken",
      withRecipe: "garlic-rice",
    })
    await plan({ date: day, meal: "dinner", recipe: "green-salad" })
    // Lunch's only dish doesn't say how long it takes, so it sends nothing.
    await plan({ date: day, meal: "lunch", recipe: "green-salad" })
    // Breakfast at 09:00 with rice: start at 08:35, 12:35 UTC.
    await setSlotTime(day, "breakfast", "09:00")
    await plan({ date: day, meal: "breakfast", recipe: "garlic-rice" })

    expect(
      await run("2027-03-14T21:10:00.000Z", "2027-03-14T21:14:59.000Z")
    ).toEqual([])
    const sent = await run(
      "2027-03-14T21:14:59.000Z",
      "2027-03-14T21:15:02.000Z"
    )
    expect(sent).toEqual([
      expect.objectContaining({
        type: "meal.time_to_start",
        by: null,
        via: "merran",
        date: day,
        meal: "dinner",
        time: "18:00",
        serveAt: "2027-03-14T22:00:00.000Z",
        startAt: "2027-03-14T21:15:00.000Z",
        minutes: 45,
        dishes: [
          expect.objectContaining({
            entryId: chicken.id,
            title: "Lemon Chicken",
            totalMinutes: 45,
          }),
          expect.objectContaining({ title: "Green Salad", totalMinutes: null }),
        ],
      }),
    ])
    expect(
      await run("2027-03-14T21:15:02.000Z", "2027-03-14T21:20:00.000Z")
    ).toEqual([])

    // Breakfast's start went by 16 minutes before this run: too late to say.
    expect(
      await run("2027-03-14T12:46:00.000Z", "2027-03-14T12:51:00.000Z")
    ).toEqual([])
    // Lunch's usual 12:00 comes and goes with nothing.
    expect(
      await run("2027-03-14T15:55:00.000Z", "2027-03-14T16:00:00.000Z")
    ).toEqual([])
  })

  test("a long dish starts the evening before", async () => {
    // Overnight oats take 10 hours, for breakfast at 08:00 on Tuesday the
    // 16th: start at 22:00 on Monday there, 02:00 UTC on Tuesday.
    await plan({
      date: "2027-03-16",
      meal: "breakfast",
      recipe: "overnight-oats",
    })

    const sent = await run(
      "2027-03-16T01:55:00.000Z",
      "2027-03-16T02:00:04.000Z"
    )
    expect(ofType(sent, "meal.time_to_start")).toEqual([
      expect.objectContaining({
        date: "2027-03-16",
        meal: "breakfast",
        startAt: "2027-03-16T02:00:00.000Z",
        minutes: 600,
      }),
    ])
  })

  test("a meal made already, or marked Didn't, says nothing", async () => {
    const day = "2027-03-17"
    const stew = await plan({ date: day, meal: "dinner", recipe: "slow-stew" })
    const made = await kyle.patch(`/api/plan/entries/${stew.id}`, {
      status: "cooked",
    })
    expect(made.status, await made.clone().text()).toBe(200)

    // 18:00 less 8 hours is 10:00 there, 14:00 UTC.
    expect(
      await run("2027-03-17T13:55:00.000Z", "2027-03-17T14:00:02.000Z")
    ).toEqual([])
  })
})

/** Puts something in the pantry, with its use-by day set. */
async function pantryItem(
  text: string,
  storedIn: string,
  useBy: string | null
): Promise<{ id: string; name: string }> {
  const added = await kyle.post("/api/pantry/items", { text, storedIn })
  expect(added.status, await added.clone().text()).toBe(201)
  const item = (await added.json()) as { id: string; name: string }
  const changed = await kyle.patch(`/api/pantry/items/${item.id}`, { useBy })
  expect(changed.status, await changed.clone().text()).toBe(200)
  return item
}
