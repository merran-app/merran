import { addDays, clockIn } from "@merran/shared"
import { afterAll, beforeAll, expect, test } from "vitest"
import type { App } from "../../../app.ts"
import { Household } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { forHousehold } from "../../../database/scope.ts"
import {
  createTestApp,
  setUpServer,
  type TestClient,
} from "../../../test/app.ts"
import { listenToEverything, sentEvents } from "../../../test/webhooks.ts"
import { sendUseSoon } from "./daily.ts"

// pantry.use_soon lists only what's come within 2 days of its use-by day
// since it was last sent, and nothing when nothing has. What came in is
// told by when things were put away, so these runs are at the real time,
// on the days the daily run would be.

let app: App
let database: Database
let close: () => Promise<void>
let kyle: TestClient
let home: string
let today: string

beforeAll(async () => {
  const test = await createTestApp({ publicUrl: "http://merran.test" })
  ;({ app, database, close } = test)
  kyle = await setUpServer(app, test.setupCode)
  const household = await kyle.patch("/api/households/current", {
    timeZone: "UTC",
    weekStartsOn: 1,
    country: "US",
  })
  home = (await household.json()).id
  today = clockIn("UTC").today
  await listenToEverything(kyle)
})

afterAll(() => close())

async function pantryItem(text: string, useBy: string | null) {
  const added = await kyle.post("/api/pantry/items", {
    text,
    storedIn: "fridge",
  })
  expect(added.status, await added.clone().text()).toBe(201)
  const item = (await added.json()) as { id: string; name: string }
  const changed = await kyle.patch(`/api/pantry/items/${item.id}`, { useBy })
  expect(changed.status, await changed.clone().text()).toBe(200)
  return item
}

/** The daily run on a day, at the moment it's called. Returns what it listed. */
async function dailyRun(day: string) {
  const em = forHousehold(database.em, home)
  const household = await em.findOneOrFail(Household, { id: home })
  // A moment apart from what's put away just before and after.
  await new Promise((resolve) => setTimeout(resolve, 5))
  const sent = await sendUseSoon(em, { household, today: day, now: new Date() })
  await new Promise((resolve) => setTimeout(resolve, 5))
  if (!sent) return null
  const events = await sentEvents(database, home, "pantry.use_soon")
  return events.at(-1)!.items.map((item: { name: string }) => item.name)
}

test("lists what came into the window since it was last sent", async () => {
  const spinach = await pantryItem("spinach", addDays(today, 1))
  const milk = await pantryItem("milk", addDays(today, 5))
  await pantryItem("rice", null)

  // The first lists everything that's close.
  expect(await dailyRun(today)).toEqual([spinach.name])
  // Once a day: the same day again sends nothing.
  expect(await dailyRun(today)).toBeNull()

  // Put away since, and close already.
  const yogurt = await pantryItem("yogurt", addDays(today, 2))
  expect(await dailyRun(addDays(today, 1))).toEqual([yogurt.name])

  // Two days on, the milk comes into the window; spinach and yogurt were told.
  expect(await dailyRun(addDays(today, 3))).toEqual([milk.name])

  // Nothing new: nothing sent.
  expect(await dailyRun(addDays(today, 4))).toBeNull()

  // Something past its use-by day, put away since, is still told.
  const cream = await pantryItem("cream", addDays(today, -1))
  expect(await dailyRun(addDays(today, 5))).toEqual([cream.name])
})
