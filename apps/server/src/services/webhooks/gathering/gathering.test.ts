import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import {
  Job,
  ShoppingItem,
  ShoppingList,
  WebhookDelivery,
  WebhookEvent,
} from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { forHousehold } from "../../../database/scope.ts"
import { inHouseholdTransaction } from "../../../database/transactions.ts"
import {
  createTestApp,
  setUpServer,
  type TestClient,
} from "../../../test/app.ts"
import {
  gatherNow,
  listenToEverything,
  sentEvents,
} from "../../../test/webhooks.ts"
import type { JobRunner } from "../../jobs/runner.ts"
import { withActor, type Actor } from "../actor.ts"
import { recipeRef } from "../payloads.ts"
import { record, WEBHOOK_DELIVERY_JOB } from "../record.ts"
import { configureWebhooks, linkBase } from "../state.ts"
import { GATHER_MS, queueGathering, WEBHOOK_GATHER_JOB } from "./gathering.ts"

let database: Database
let jobs: JobRunner
let close: () => Promise<void>
let kyle: TestClient
let home: string

const KYLE: Actor = {
  by: { id: "u1", name: "Kyle" },
  via: "app",
  key: null,
}

/** Kyle again, through the API key his n8n flow uses. */
const N8N: Actor = {
  by: { id: "u1", name: "Kyle" },
  via: "api",
  key: { id: "k1", name: "n8n" },
}

/** And through another key of his, for Home Assistant. */
const HOME_ASSISTANT: Actor = {
  by: { id: "u1", name: "Kyle" },
  via: "api",
  key: { id: "k2", name: "Home Assistant" },
}

beforeAll(async () => {
  const test = await createTestApp()
  ;({ database, jobs, close } = test)
  kyle = await setUpServer(test.app, test.setupCode)
  home = (await (await kyle.get("/api/households/current")).json()).id
  await listenToEverything(kyle)
})

afterAll(() => close())

// Each test starts with nothing recorded, gathered or queued.
beforeEach(async () => {
  const em = inHome()
  await em.nativeDelete(WebhookDelivery, {})
  await em.nativeDelete(WebhookEvent, {})
  await em.nativeDelete(Job, {
    kind: { $in: [WEBHOOK_GATHER_JOB, WEBHOOK_DELIVERY_JOB] },
  })
})

/** An entity manager that sees only Home's rows, as a route's does. */
const inHome = () => forHousehold(database.em, home)

const gatherJobs = () => inHome().find(Job, { kind: WEBHOOK_GATHER_JOB })

/** The gathered rows, merged or not. */
const gatheredRows = () => inHome().find(WebhookEvent, { gathered: true })

/** A shopping list with things on it, some checked off. */
async function addList(
  name: string,
  counts: { left: number; checked: number }
) {
  const em = inHome()
  const list = em.create(ShoppingList, { household: home, name })
  await em.flush()
  await addItems(list.id, counts)
  return list
}

async function addItems(
  listId: string,
  counts: { left: number; checked: number }
) {
  const em = inHome()
  const states = [
    ...Array<boolean>(counts.left).fill(false),
    ...Array<boolean>(counts.checked).fill(true),
  ]
  for (const [index, checked] of states.entries()) {
    em.create(ShoppingItem, {
      household: home,
      list: listId,
      name: `Thing ${index + 1}`,
      source: "typed",
      checked,
    })
  }
  await em.flush()
}

describe("gathering", () => {
  test("30 changes in a window make one event with exact counts", async () => {
    const days = ["2026-11-12", "2026-11-10", "2026-11-11"]
    const started = Date.now()

    await withActor(KYLE, async () => {
      for (let change = 0; change < 30; change++) {
        await record(inHome(), home, {
          type: "plan.changed",
          data: { days: [days[change % 3]!], added: 1 },
        })
      }
      for (let change = 0; change < 2; change++) {
        await record(inHome(), home, {
          type: "plan.changed",
          data: { removed: 1 },
        })
      }
    })

    expect(await sentEvents(database, home)).toEqual([])
    const [job, ...others] = await gatherJobs()
    expect(others).toEqual([])
    expect(job).toMatchObject({
      status: "queued",
      key: `webhooks.gather:${home}:plan.changed`,
      payload: { type: "plan.changed" },
    })
    // Thirty seconds from the first change: later ones don't put it off.
    expect(job!.runAt.getTime()).toBeGreaterThanOrEqual(started + GATHER_MS)
    expect(job!.runAt.getTime()).toBeLessThan(started + GATHER_MS + 1_000)

    await gatherNow(database, jobs)

    const [event, ...more] = await sentEvents(database, home)
    expect(more).toEqual([])
    expect(event).toMatchObject({
      type: "plan.changed",
      days: ["2026-11-10", "2026-11-11", "2026-11-12"],
      pools: [],
      added: 30,
      moved: 0,
      changed: 0,
      removed: 2,
      by: { name: "Kyle" },
      via: "app",
      key: null,
    })
    const gathered = await gatheredRows()
    expect(gathered).toHaveLength(32)
    expect(gathered.every((row) => row.merged)).toBe(true)
    // Only the event that was sent has a delivery.
    expect(await inHome().count(WebhookDelivery, {})).toBe(1)
  })

  test("each person's changes are their own event", async () => {
    const groceries = await addList("Groceries", { left: 4, checked: 30 })

    for (const [actor, times] of [
      [KYLE, 20],
      [N8N, 10],
      [HOME_ASSISTANT, 5],
    ] as const) {
      await withActor(actor, async () => {
        for (let change = 0; change < times; change++) {
          await record(inHome(), home, {
            type: "list.changed",
            data: { lists: [groceries.id], checked: 1 },
          })
        }
      })
    }
    await gatherNow(database, jobs)

    const tally = { id: groceries.id, name: "Groceries", left: 4, checked: 30 }
    expect(await sentEvents(database, home)).toEqual([
      expect.objectContaining({
        type: "list.changed",
        lists: [tally],
        checked: 20,
        added: 0,
        by: { id: "u1", name: "Kyle" },
        via: "app",
        key: null,
      }),
      expect.objectContaining({
        type: "list.changed",
        lists: [tally],
        checked: 10,
        added: 0,
        by: { id: "u1", name: "Kyle" },
        via: "api",
        key: { id: "k1", name: "n8n" },
      }),
      expect.objectContaining({
        type: "list.changed",
        lists: [tally],
        checked: 5,
        via: "api",
        key: { id: "k2", name: "Home Assistant" },
      }),
    ])
  })

  test("lists are told as they are when the merge is made", async () => {
    const costco = await addList("Costco", { left: 3, checked: 0 })
    const target = await addList("Target", { left: 1, checked: 1 })

    await withActor(KYLE, async () => {
      await record(inHome(), home, {
        type: "list.changed",
        data: { lists: [costco.id, target.id], added: 2 },
      })
      await record(inHome(), home, {
        type: "list.changed",
        data: { lists: [target.id, costco.id], checked: 1 },
      })
    })
    // Before the merge, more goes on Costco and Target goes altogether.
    await addItems(costco.id, { left: 1, checked: 2 })
    await inHome().nativeDelete(ShoppingItem, { list: target.id })
    await inHome().nativeDelete(ShoppingList, { id: target.id })
    await gatherNow(database, jobs)

    const [event] = await sentEvents(database, home, "list.changed")
    expect(event).toMatchObject({
      lists: [{ id: costco.id, name: "Costco", left: 4, checked: 2 }],
      added: 2,
      checked: 1,
    })
  })

  test("a change during a merge is sent by the next one", async () => {
    await withActor(KYLE, () =>
      record(inHome(), home, { type: "pantry.changed", data: { added: 2 } })
    )
    const [job] = await gatherJobs()
    // The runner takes it for its first try.
    await inHome().nativeUpdate(
      Job,
      { id: job!.id },
      { status: "running", attempts: 1, startedAt: new Date() }
    )

    const changed = Date.now()
    await withActor(KYLE, () =>
      record(inHome(), home, { type: "pantry.changed", data: { usedUp: 1 } })
    )

    // The same job, started over thirty seconds on.
    const [rearmed, ...others] = await gatherJobs()
    expect(others).toEqual([])
    expect(rearmed!.id).toBe(job!.id)
    expect(rearmed!.attempts).toBe(0)
    expect(rearmed!.runAt.getTime()).toBeGreaterThanOrEqual(changed + GATHER_MS)
    expect(rearmed!.runAt.getTime()).toBeLessThan(changed + GATHER_MS + 1_000)

    // Its try ends, and the runner, finding it started over, queues it again.
    await inHome().nativeUpdate(
      Job,
      { id: job!.id },
      { status: "queued", startedAt: null }
    )
    await gatherNow(database, jobs)

    expect(await sentEvents(database, home)).toEqual([
      expect.objectContaining({ type: "pantry.changed", usedUp: 1 }),
    ])
  })

  test("a change keeps a waiting job waiting with a write", async () => {
    await withActor(KYLE, () =>
      record(inHome(), home, { type: "pantry.changed", data: { added: 1 } })
    )
    const [job] = await gatherJobs()
    const longAgo = new Date("2026-01-01T00:00:00Z")
    await inHome().nativeUpdate(Job, { id: job!.id }, { updatedAt: longAgo })

    await withActor(KYLE, () =>
      record(inHome(), home, { type: "pantry.changed", data: { removed: 1 } })
    )

    // Written while still waiting, which holds the runner off until the
    // change is saved, and no later than it was.
    const [kept, ...others] = await gatherJobs()
    expect(others).toEqual([])
    expect(kept).toMatchObject({ id: job!.id, status: "queued", attempts: 0 })
    expect(kept!.runAt).toEqual(job!.runAt)
    expect(kept!.updatedAt.getTime()).toBeGreaterThan(longAgo.getTime())
  })

  test("a job taken between a change's read and its write is started over", async () => {
    await withActor(KYLE, () =>
      record(inHome(), home, { type: "pantry.changed", data: { added: 1 } })
    )
    const [waiting] = await gatherJobs()
    // The runner takes it just after a change reads it.
    await inHome().nativeUpdate(
      Job,
      { id: waiting!.id },
      { status: "running", attempts: 1, startedAt: new Date() }
    )
    // The change reads it as it was, waiting.
    const em = inHome()
    vi.spyOn(em, "findOne").mockResolvedValueOnce(waiting as never)

    const changed = Date.now()
    await queueGathering(em, home, "pantry.changed")
    await em.flush()

    const [rearmed, ...others] = await gatherJobs()
    expect(others).toEqual([])
    expect(rearmed).toMatchObject({ id: waiting!.id, attempts: 0 })
    expect(rearmed!.runAt.getTime()).toBeGreaterThanOrEqual(changed + GATHER_MS)
  })

  test("a change is saved before its job is looked for", async () => {
    const em = inHome()
    const findOne = em.findOne.bind(em)
    let savedWhenLooked: number | null = null
    vi.spyOn(em, "findOne").mockImplementation(async (entityName, ...rest) => {
      if (entityName === Job) {
        savedWhenLooked = await inHome().count(WebhookEvent, {})
      }
      return findOne(entityName, ...rest)
    })

    await withActor(KYLE, () =>
      record(em, home, { type: "pantry.changed", data: { added: 1 } })
    )

    // So outside a transaction, a merge the runner starts from then on
    // reads it.
    expect(savedWhenLooked).toBe(1)
  })

  test("a webhook gone before the merge sends nothing", async () => {
    await withActor(KYLE, () =>
      record(inHome(), home, {
        type: "plan.changed",
        data: { days: ["2026-11-11"], added: 1 },
      })
    )
    const [webhook] = await (
      await kyle.get("/api/households/current/webhooks")
    ).json()
    const deleted = await kyle.delete(
      `/api/households/current/webhooks/${webhook.id}`
    )
    expect(deleted.status).toBe(204)
    await gatherNow(database, jobs)

    expect(await sentEvents(database, home)).toEqual([])
    expect((await gatheredRows()).every((row) => row.merged)).toBe(true)

    // A new webhook hears of what happens next, and only that.
    await listenToEverything(kyle)
    await withActor(KYLE, () =>
      record(inHome(), home, {
        type: "plan.changed",
        data: { days: ["2026-11-12"], moved: 1 },
      })
    )
    await gatherNow(database, jobs)

    expect(await sentEvents(database, home)).toEqual([
      expect.objectContaining({
        type: "plan.changed",
        days: ["2026-11-12"],
        added: 0,
        moved: 1,
      }),
    ])
  })

  test("webhooks off before the merge sends nothing", async () => {
    await withActor(KYLE, () =>
      record(inHome(), home, { type: "pantry.changed", data: { added: 1 } })
    )
    const publicUrl = linkBase()

    configureWebhooks({ enabled: false, publicUrl: null })
    try {
      await gatherNow(database, jobs)
    } finally {
      configureWebhooks({ enabled: true, publicUrl })
    }

    expect(await sentEvents(database, home)).toEqual([])
    expect((await gatheredRows()).every((row) => row.merged)).toBe(true)

    // Back on, what happens next is sent on its own.
    await withActor(KYLE, () =>
      record(inHome(), home, { type: "pantry.changed", data: { removed: 1 } })
    )
    await gatherNow(database, jobs)

    expect(await sentEvents(database, home)).toEqual([
      expect.objectContaining({
        type: "pantry.changed",
        added: 0,
        removed: 1,
      }),
    ])
  })

  test("an empty part records nothing", async () => {
    expect(
      await record(inHome(), home, { type: "pantry.changed", data: {} })
    ).toBeNull()
    expect(
      await record(inHome(), home, {
        type: "plan.changed",
        data: { days: ["2026-11-11"], added: 0 },
      })
    ).toBeNull()

    expect(await inHome().count(WebhookEvent, {})).toBe(0)
    expect(await gatherJobs()).toEqual([])
  })

  test("a change that rolls back leaves nothing to gather", async () => {
    await expect(
      inHouseholdTransaction(database.em.fork(), home, async (tx) => {
        await record(tx, home, {
          type: "list.changed",
          data: { lists: [], added: 1 },
        })
        throw new Error("Rolled back")
      })
    ).rejects.toThrow("Rolled back")

    expect(await inHome().count(WebhookEvent, {})).toBe(0)
    expect(await gatherJobs()).toEqual([])
  })

  test("other events aren't gathered", async () => {
    const event = await record(inHome(), home, {
      type: "recipe.deleted",
      data: {
        recipe: recipeRef({
          id: "0199e8b0-5a10-7a01-8b00-000000000006",
          slug: "lemon-chicken",
          name: "Lemon Chicken",
        }),
      },
    })

    expect(await sentEvents(database, home)).toEqual([
      expect.objectContaining({ type: "recipe.deleted" }),
    ])
    expect(await inHome().count(WebhookDelivery, { event: event!.id })).toBe(1)
    expect(await gatherJobs()).toEqual([])
  })
})
