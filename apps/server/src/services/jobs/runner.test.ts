import { pino } from "pino"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import { Household, Job, User } from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { createTestDatabase } from "../../test/database.ts"
import { createEventBus, LIVE_AREAS, type LiveEvent } from "../events/events.ts"
import {
  currentActor,
  MERRAN,
  withActor,
  type Actor,
} from "../webhooks/actor.ts"
import { cancelJob, enqueue, restartJob, retryJob } from "./jobs.ts"
import {
  JobRunner,
  JobStopped,
  type JobDeps,
  type JobHandler,
} from "./runner.ts"
import { stopSignal } from "./stop.ts"

// What would go to error tracking, kept to look at instead.
const reportError = vi.hoisted(() => vi.fn())
vi.mock("../../modules/error-tracking/reporter.ts", () => ({ reportError }))

let database: Database
let close: () => Promise<void>
let home: string
let nextDoor: string

beforeAll(async () => {
  ;({ database, close } = await createTestDatabase())
  const em = database.em.fork()
  home = em.create(Household, { name: "Home", slug: "home" }).id
  nextDoor = em.create(Household, { name: "Next Door", slug: "next-door" }).id
  await em.flush()
})

afterAll(() => close())

beforeEach(async () => {
  await database.em.fork().nativeDelete(Job, {})
})

function runner(handlers: JobHandler[], options = {}) {
  const deps = {
    logger: pino({ level: "silent" }),
    database,
  } as unknown as JobDeps
  return new JobRunner({ deps, handlers, ...options })
}

const em = () => database.em.fork()
const load = (id: string) => em().findOneOrFail(Job, { id })

describe("the job runner", () => {
  test("runs a job, keeping its result and progress", async () => {
    const jobs = runner([
      {
        kind: "count",
        run: async ({ payload, progress }) => {
          await progress(2, 2)
          return { counted: payload.to }
        },
      },
    ])
    const job = await enqueue(em(), { kind: "count", payload: { to: 2 } })
    await jobs.drain()

    expect(await load(job.id)).toMatchObject({
      status: "done",
      attempts: 1,
      result: { counted: 2 },
      progress: { done: 2, total: 2 },
    })
  })

  test("tries a failed job again later, then gives up", async () => {
    let tries = 0
    const jobs = runner([
      {
        kind: "flaky",
        run: async () => {
          tries++
          throw new Error(`Broke on try ${tries}`)
        },
      },
    ])
    const job = await enqueue(em(), { kind: "flaky", maxAttempts: 2 })
    await jobs.drain()

    const waiting = await load(job.id)
    expect(waiting).toMatchObject({ status: "queued", error: "Broke on try 1" })
    expect(waiting.runAt.getTime()).toBeGreaterThan(Date.now())

    // Its wait is over.
    await em().nativeUpdate(Job, { id: job.id }, { runAt: new Date() })
    await jobs.drain()
    expect(await load(job.id)).toMatchObject({
      status: "failed",
      attempts: 2,
      error: "Broke on try 2",
    })

    // And it can be tried again from the start.
    const tx = em()
    await retryJob(tx, await tx.findOneOrFail(Job, { id: job.id }))
    expect(await load(job.id)).toMatchObject({ status: "queued", attempts: 0 })
  })

  test("a job that fails its last try goes to error tracking", async () => {
    reportError.mockClear()
    const broke = new Error("SQLITE_BUSY: database is locked")
    const jobs = runner([
      {
        kind: "breaks",
        run: async () => {
          throw broke
        },
      },
    ])
    const job = await enqueue(em(), { kind: "breaks", maxAttempts: 2 })

    // A try with another to come is only a warning.
    await jobs.drain()
    expect(reportError).not.toHaveBeenCalled()

    await em().nativeUpdate(Job, { id: job.id }, { runAt: new Date() })
    await jobs.drain()
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(reportError).toHaveBeenCalledWith(broke)
    // The raw error stays on the job, for the server admin's Jobs card.
    expect(await load(job.id)).toMatchObject({
      status: "failed",
      error: "SQLITE_BUSY: database is locked",
    })
  })

  test("a kind's own retry schedule sets each wait", async () => {
    const tries: number[] = []
    const jobs = runner([
      {
        kind: "scheduled-flaky",
        retryDelays: [5_000, 300_000],
        run: async (ctx) => {
          tries.push(ctx.attempt)
          throw new Error(`Broke on try ${ctx.attempt}`)
        },
      },
    ])
    const job = await enqueue(em(), {
      kind: "scheduled-flaky",
      maxAttempts: 3,
    })

    await jobs.drain()
    const afterFirst = (await load(job.id)).runAt.getTime() - Date.now()
    expect(afterFirst).toBeGreaterThan(4_000)
    expect(afterFirst).toBeLessThan(6_000)

    await em().nativeUpdate(Job, { id: job.id }, { runAt: new Date() })
    await jobs.drain()
    const afterSecond = (await load(job.id)).runAt.getTime() - Date.now()
    expect(afterSecond).toBeGreaterThan(295_000)
    expect(afterSecond).toBeLessThan(305_000)

    await em().nativeUpdate(Job, { id: job.id }, { runAt: new Date() })
    await jobs.drain()
    expect((await load(job.id)).status).toBe("failed")
    expect(tries).toEqual([1, 2, 3])
  })

  test("a job knows which try it's on and how many it has", async () => {
    const seen: number[][] = []
    const jobs = runner([
      {
        kind: "counting",
        run: async (ctx) => {
          seen.push([ctx.attempt, ctx.maxAttempts])
          if (ctx.attempt === 1) throw new Error("Broke on try 1")
        },
      },
    ])
    const job = await enqueue(em(), { kind: "counting", maxAttempts: 2 })

    await jobs.drain()
    await em().nativeUpdate(Job, { id: job.id }, { runAt: new Date() })
    await jobs.drain()

    expect(seen).toEqual([
      [1, 2],
      [2, 2],
    ])
    expect((await load(job.id)).status).toBe("done")
  })

  test("a job runs as Merran, even when someone's request started it", async () => {
    let actor: Actor | undefined
    const jobs = runner([
      {
        kind: "whoami",
        run: async () => {
          actor = currentActor()
        },
      },
    ])
    const kyle: Actor = {
      by: { id: "u1", name: "Kyle" },
      via: "app",
      key: null,
    }

    // Adding a job wakes the runner from inside the request that added it.
    await withActor(kyle, async () => {
      await enqueue(em(), { kind: "whoami" })
      await jobs.drain()
    })

    expect(actor).toEqual(MERRAN)
  })

  test("tells the household's pages what a kind changes, as it goes and when it ends", async () => {
    const events = createEventBus()
    const heard: LiveEvent[] = []
    events.subscribe(home, {
      person: null,
      client: null,
      page: null,
      areas: new Set(LIVE_AREAS),
      send: (event) => heard.push(event),
      close: () => {},
    })
    const deps = {
      logger: pino({ level: "silent" }),
      database,
      events,
    } as unknown as JobDeps
    const jobs = new JobRunner({
      deps,
      handlers: [
        {
          kind: "bring-in",
          changes: ["recipes"],
          run: async ({ progress, payload }) => {
            await progress(1, 2)
            if (payload.fail) throw new Error("The second one didn't come")
          },
        },
        { kind: "quiet", run: async () => {} },
      ],
    })

    await enqueue(em(), { kind: "bring-in", householdId: home })
    await jobs.drain()
    expect(heard).toEqual([
      { type: "changed", area: "recipes", by: null, client: null },
      { type: "changed", area: "recipes", by: null, client: null },
    ])

    // One that fails may have brought some in; one that says nothing, nothing.
    heard.length = 0
    await enqueue(em(), {
      kind: "bring-in",
      householdId: home,
      payload: { fail: true },
      maxAttempts: 1,
    })
    await enqueue(em(), { kind: "quiet", householdId: home })
    await jobs.drain()
    expect(
      heard.map((event) => event.type === "changed" && event.area)
    ).toEqual(["recipes", "recipes"])
  })

  describe("how a household's job is going", () => {
    /** A runner whose household events are kept, and the job events heard. */
    function following(
      handlers: JobHandler[],
      options: Partial<ConstructorParameters<typeof JobRunner>[0]> = {}
    ) {
      const events = createEventBus()
      const heard: Extract<LiveEvent, { type: "job" }>[] = []
      events.subscribe(home, {
        person: null,
        client: null,
        page: null,
        areas: new Set(LIVE_AREAS),
        send: (event) => {
          if (event.type === "job") heard.push(event)
        },
        close: () => {},
      })
      const deps = {
        logger: pino({ level: "silent" }),
        database,
        events,
      } as unknown as JobDeps
      return { jobs: new JobRunner({ ...options, deps, handlers }), heard }
    }
    const said = (heard: Extract<LiveEvent, { type: "job" }>[]) =>
      heard.map((event) => [event.job.status, event.job.progress])

    test("is told as it starts, moves on and ends", async () => {
      const { jobs, heard } = following([
        {
          kind: "import",
          area: "recipes",
          run: async ({ progress }) => {
            await progress(1, 2)
            await progress(2, 2)
          },
        },
      ])
      const job = await enqueue(em(), { kind: "import", householdId: home })
      await jobs.drain()

      expect(said(heard)).toEqual([
        ["running", null],
        ["running", { done: 1, total: 2 }],
        ["running", { done: 2, total: 2 }],
        ["done", { done: 2, total: 2 }],
      ])
      expect(heard[0]).toMatchObject({
        area: "recipes",
        job: { id: job.id, kind: "import", startedBy: null },
      })
    })

    test("saves progress that came too soon, once the half second is up", async () => {
      // Two moves a moment apart: the second must still be told.
      let finish!: () => void
      const finished = new Promise<void>((resolve) => {
        finish = resolve
      })
      const { jobs, heard } = following([
        {
          kind: "long",
          area: "recipes",
          run: async ({ progress }) => {
            await progress(1, 3, { at: 1 })
            await progress(2, 3, { at: 2 })
            await finished
            return { at: "end" }
          },
        },
      ])
      const job = await enqueue(em(), { kind: "long", householdId: home })
      await jobs.start()
      await expect
        .poll(async () => (await load(job.id)).progress, { timeout: 2000 })
        .toEqual({ done: 2, total: 3 })
      expect((await load(job.id)).result).toEqual({ at: 2 })
      expect(said(heard)).toContainEqual(["running", { done: 2, total: 3 }])
      finish()
      await expect.poll(async () => (await load(job.id)).status).toBe("done")
      await jobs.stop()
    })

    test("doesn't save progress it held back once the job has ended", async () => {
      const { jobs } = following([
        {
          kind: "long",
          run: async ({ progress }) => {
            await progress(1, 3, { at: 1 })
            await progress(2, 3, { at: 2 })
            return { at: "end" }
          },
        },
      ])
      const job = await enqueue(em(), { kind: "long" })
      await jobs.start()
      await expect.poll(async () => (await load(job.id)).status).toBe("done")
      await new Promise((resolve) => setTimeout(resolve, 700))
      expect((await load(job.id)).result).toEqual({ at: "end" })
      await jobs.stop()
    })

    test("says who started it, so the app can tell them when it ends", async () => {
      const setup = em()
      const jamie = setup.create(User, {
        name: "Jamie",
        email: "jamie@example.com",
        username: "jamie",
        displayUsername: "jamie",
      })
      await setup.flush()
      const { jobs, heard } = following([
        { kind: "import", area: "recipes", run: async () => {} },
      ])
      await enqueue(em(), {
        kind: "import",
        householdId: home,
        createdBy: jamie.id,
      })
      await jobs.drain()

      expect(heard.map((event) => event.job.startedBy)).toEqual([
        jamie.id,
        jamie.id,
      ])
    })

    test("says it's queued when it'll be tried again, and nothing when Merran shuts down", async () => {
      let letItGo!: () => void
      const held = new Promise<void>((resolve) => (letItGo = resolve))
      const { jobs, heard } = following([
        {
          kind: "flaky",
          area: "recipes",
          run: async () => {
            throw new Error("Broke")
          },
        },
        {
          kind: "long",
          area: "recipes",
          run: async ({ signal }) => {
            letItGo()
            await new Promise((resolve) =>
              signal.addEventListener("abort", resolve)
            )
            throw new JobStopped()
          },
        },
      ])
      await enqueue(em(), { kind: "flaky", householdId: home, maxAttempts: 2 })
      await jobs.drain()
      expect(said(heard)).toEqual([
        ["running", null],
        ["queued", null],
      ])

      heard.length = 0
      await enqueue(em(), { kind: "long", householdId: home })
      jobs.wake()
      await held
      await jobs.stop()
      expect(said(heard)).toEqual([["running", null]])
    })

    test("a job changed after the look for work found it runs as it is when it's taken", async () => {
      // As Check prices now joins a check waiting its turn: what it does and
      // who started it change after the runner found it, before it took it.
      const setup = em()
      const sam = setup.create(User, {
        name: "Sam",
        email: "sam@example.com",
        username: "sam",
        displayUsername: "sam",
      })
      await setup.flush()
      const seen: unknown[] = []
      const { jobs, heard } = following(
        [
          {
            kind: "check",
            area: "recipes",
            run: async ({ payload }) => {
              seen.push(payload)
            },
          },
        ],
        {
          beforeTaking: async (jobId) => {
            await em().nativeUpdate(
              Job,
              { id: jobId },
              { payload: { now: true }, createdBy: sam.id }
            )
          },
        }
      )
      await enqueue(em(), {
        kind: "check",
        householdId: home,
        payload: { now: false },
      })
      await jobs.drain()

      expect(seen).toEqual([{ now: true }])
      expect(heard.map((event) => event.job.startedBy)).toEqual([
        sam.id,
        sam.id,
      ])
    })

    test("is told when a waiting job is cancelled", async () => {
      const { jobs, heard } = following([
        { kind: "import", area: "recipes", run: async () => {} },
      ])
      const job = await enqueue(em(), { kind: "import", householdId: home })
      await jobs.cancel(em(), await load(job.id))
      expect(said(heard)).toEqual([["cancelled", null]])
    })
  })

  test("runs one of a kind at a time, unless it says more", async () => {
    let now = 0
    let most = 0
    const slow: JobHandler = {
      kind: "slow",
      run: async () => {
        most = Math.max(most, ++now)
        await new Promise((resolve) => setTimeout(resolve, 20))
        now--
      },
    }
    for (let i = 0; i < 3; i++) await enqueue(em(), { kind: "slow" })
    await runner([slow]).drain()
    expect(most).toBe(1)

    // Each waits for the other two to start, rather than for a time that a
    // busy database can outlast. Not for long, if they never do.
    most = 0
    let started!: () => void
    const allStarted = new Promise<void>((resolve) => (started = resolve))
    const together: JobHandler = {
      kind: "slow",
      concurrency: 3,
      run: async () => {
        most = Math.max(most, ++now)
        if (now === 3) started()
        await Promise.race([
          allStarted,
          new Promise((resolve) => setTimeout(resolve, 1000)),
        ])
        now--
      },
    }
    for (let i = 0; i < 3; i++) await enqueue(em(), { kind: "slow" })
    await runner([together]).drain()
    expect(most).toBe(3)
  })

  test("gives each household a fair share", async () => {
    const started: string[] = []
    const jobs = runner(
      [
        {
          kind: "work",
          concurrency: 2,
          run: async ({ payload }) => {
            started.push(String(payload.name))
            await new Promise((resolve) => setTimeout(resolve, 10))
          },
        },
      ],
      { lanes: { long: 2 } }
    )
    for (const name of ["home 1", "home 2", "home 3"]) {
      await enqueue(em(), {
        kind: "work",
        householdId: home,
        payload: { name },
      })
    }
    await enqueue(em(), {
      kind: "work",
      householdId: nextDoor,
      payload: { name: "next door" },
    })
    await jobs.drain()

    // Next door doesn't wait for all of home's.
    expect(started.slice(0, 2).sort()).toEqual(["home 1", "next door"])
  })

  test("a kind at its limit doesn't keep other kinds from their turn", async () => {
    // More of one kind are due than the runner looks at in one go, as when
    // deliveries pile up for a receiver that hangs, and they came first.
    let letThemGo!: () => void
    const held = new Promise<void>((resolve) => (letThemGo = resolve))
    let otherRan = false
    const jobs = runner([
      { kind: "hog", run: () => held },
      {
        kind: "other",
        run: async () => {
          otherRan = true
        },
      },
    ])
    const tx = em()
    const longAgo = new Date(Date.now() - 60 * 60_000)
    for (let i = 0; i < 60; i++) {
      tx.create(Job, { kind: "hog", payload: {}, runAt: longAgo })
    }
    await tx.flush()
    await enqueue(em(), { kind: "other" })

    const draining = jobs.drain()
    try {
      await expect
        .poll(() => em().count(Job, { kind: "hog", status: "running" }))
        .toBe(1)
      // The next look for work, as the runner makes every few seconds.
      jobs.wake()
      await expect.poll(() => otherRan).toBe(true)
    } finally {
      letThemGo()
      await draining
    }
  })

  test("a quick job doesn't wait while long ones fill their lane", async () => {
    let letThemGo!: () => void
    const held = new Promise<void>((resolve) => (letThemGo = resolve))
    const jobs = runner(
      [
        { kind: "import", lane: "long", concurrency: 2, run: () => held },
        { kind: "email", lane: "quick", run: async () => {} },
      ],
      { lanes: { long: 1 } }
    )
    const first = await enqueue(em(), { kind: "import" })
    const second = await enqueue(em(), { kind: "import" })
    const email = await enqueue(em(), { kind: "email" })

    const draining = jobs.drain()
    try {
      await expect.poll(async () => (await load(email.id)).status).toBe("done")
      expect((await load(first.id)).status).toBe("running")
      expect((await load(second.id)).status).toBe("queued")
    } finally {
      letThemGo()
      await draining
    }
  })

  test("each lane runs as many as its size", async () => {
    let now = 0
    let most = 0
    // Each waits for another to start, rather than for a time that a busy
    // database can outlast. Not for long, if none does.
    let started!: () => void
    const twoStarted = new Promise<void>((resolve) => (started = resolve))
    const longKind = (kind: string): JobHandler => ({
      kind,
      lane: "long",
      concurrency: 3,
      run: async () => {
        most = Math.max(most, ++now)
        if (now === 2) started()
        await Promise.race([
          twoStarted,
          new Promise((resolve) => setTimeout(resolve, 1000)),
        ])
        await new Promise((resolve) => setTimeout(resolve, 20))
        now--
      },
    })
    const jobs = runner([longKind("a"), longKind("b"), longKind("c")], {
      lanes: { quick: 1, long: 2 },
    })
    for (const kind of ["a", "b", "c"]) {
      await enqueue(em(), { kind })
      await enqueue(em(), { kind })
    }
    await jobs.drain()
    expect(most).toBe(2)
  })

  test("a full lane's kinds are left out of the look for due work", async () => {
    // Long jobs that could still start by their kind's limit, more than the
    // runner looks at in one go and older, while their lane is full.
    let letThemGo!: () => void
    const held = new Promise<void>((resolve) => (letThemGo = resolve))
    let quickRan = false
    const jobs = runner(
      [
        { kind: "hog", lane: "long", concurrency: 5, run: () => held },
        {
          kind: "email",
          lane: "quick",
          run: async () => {
            quickRan = true
          },
        },
      ],
      { lanes: { long: 1 } }
    )
    const tx = em()
    const longAgo = new Date(Date.now() - 60 * 60_000)
    for (let i = 0; i < 60; i++) {
      tx.create(Job, { kind: "hog", payload: {}, runAt: longAgo })
    }
    await tx.flush()
    await enqueue(em(), { kind: "email" })

    const draining = jobs.drain()
    try {
      await expect
        .poll(() => em().count(Job, { kind: "hog", status: "running" }))
        .toBe(1)
      // The next look for work, as the runner makes every few seconds.
      jobs.wake()
      await expect.poll(() => quickRan).toBe(true)
    } finally {
      letThemGo()
      await draining
    }
  })

  test("a job someone's waiting on takes the next place ahead of older background work", async () => {
    // A big import's nutrition jobs, say: more than one look takes in, and
    // older, with the lane's one place taken, when someone presses Work out
    // nutrition and waits.
    let letThemGo!: () => void
    const held = new Promise<void>((resolve) => (letThemGo = resolve))
    const started: string[] = []
    const jobs = runner(
      [
        {
          kind: "backlog",
          concurrency: 5,
          run: async () => {
            started.push("backlog")
            await held
          },
        },
        {
          kind: "pressed",
          waitedOn: true,
          run: async () => {
            started.push("pressed")
          },
        },
      ],
      { lanes: { long: 1 } }
    )
    const tx = em()
    const longAgo = new Date(Date.now() - 60 * 60_000)
    for (let i = 0; i < 60; i++) {
      tx.create(Job, { kind: "backlog", payload: {}, runAt: longAgo })
    }
    await tx.flush()

    const draining = jobs.drain()
    try {
      await expect.poll(() => started.length).toBe(1)
      await enqueue(em(), { kind: "pressed" })
    } finally {
      // The place frees.
      letThemGo()
      await draining
    }
    expect(started.slice(0, 2)).toEqual(["backlog", "pressed"])
  })

  test("one household's jobs of a kind wait their turn without holding up another's", async () => {
    let letThemGo!: () => void
    const held = new Promise<void>((resolve) => (letThemGo = resolve))
    const jobs = runner([
      { kind: "import", concurrency: 2, perHousehold: 1, run: () => held },
    ])
    // Home's two are all there is at first, so a fair share alone would
    // start both and leave next door's waiting.
    await enqueue(em(), { kind: "import", householdId: home })
    const second = await enqueue(em(), { kind: "import", householdId: home })

    const draining = jobs.drain()
    try {
      await expect
        .poll(() => em().count(Job, { status: "running" }))
        .toBeGreaterThanOrEqual(1)
      await enqueue(em(), { kind: "import", householdId: nextDoor })
      // The next look for work, as adding a job starts in the app.
      jobs.wake()
      const running = async () => {
        const jobs = await em().find(Job, { status: "running" })
        return jobs.map((job) => job.forHousehold?.id).sort()
      }
      await expect.poll(running).toEqual([home, nextDoor].sort())
      expect((await load(second.id)).status).toBe("queued")
    } finally {
      letThemGo()
      await draining
    }
  })

  test("a household at its limit for a kind is left out of the look for due work", async () => {
    // More of one household's jobs of a kind are due than the runner looks
    // at in one go, and older, while it runs as many as it may.
    let letThemGo!: () => void
    const held = new Promise<void>((resolve) => (letThemGo = resolve))
    let nextDoorRan = false
    const jobs = runner([
      {
        kind: "nutrition",
        concurrency: 2,
        perHousehold: 1,
        run: async ({ householdId }) => {
          if (householdId === nextDoor) nextDoorRan = true
          else await held
        },
      },
    ])
    const tx = em()
    const longAgo = new Date(Date.now() - 60 * 60_000)
    for (let i = 0; i < 60; i++) {
      tx.create(Job, {
        kind: "nutrition",
        payload: {},
        forHousehold: home,
        runAt: longAgo,
      })
    }
    await tx.flush()
    await enqueue(em(), { kind: "nutrition", householdId: nextDoor })

    const draining = jobs.drain()
    try {
      await expect
        .poll(() => em().count(Job, { kind: "nutrition", status: "running" }))
        .toBeGreaterThanOrEqual(1)
      // The next look for work, as the runner makes every few seconds.
      jobs.wake()
      await expect.poll(() => nextDoorRan).toBe(true)
    } finally {
      letThemGo()
      await draining
    }
  })

  test("a job cut off by a restart sees what it saved so far", async () => {
    const seen: unknown[] = []
    let started!: () => void
    const running = new Promise<void>((resolve) => (started = resolve))
    const handler: JobHandler = {
      kind: "resume",
      run: async ({ saved, progress, signal }) => {
        seen.push(saved)
        if (seen.length > 1) return
        await progress(1, 2, { done: ["a"] })
        started()
        await new Promise((resolve) =>
          signal.addEventListener("abort", resolve)
        )
        throw new JobStopped()
      },
    }
    const first = runner([handler])
    await enqueue(em(), { kind: "resume" })
    first.wake()
    await running
    await first.stop()

    await runner([handler]).drain()
    expect(seen).toEqual([null, { done: ["a"] }])
  })

  test("a job that carries on after it's stopped is still stopped", async () => {
    // Like a library run that catches each recipe's error, the stop's too.
    let started!: () => void
    let running = new Promise<void>((resolve) => (started = resolve))
    const handler: JobHandler = {
      kind: "swallow",
      run: async ({ signal }) => {
        started()
        await new Promise((resolve) =>
          signal.addEventListener("abort", resolve)
        )
        return { finished: true }
      },
    }

    const cancelling = runner([handler])
    const cancelled = await enqueue(em(), { kind: "swallow" })
    const draining = cancelling.drain()
    await running
    cancelling.stopJob(cancelled.id)
    await draining
    expect(await load(cancelled.id)).toMatchObject({ status: "cancelled" })

    running = new Promise<void>((resolve) => (started = resolve))
    const shuttingDown = runner([handler])
    const cutOff = await enqueue(em(), { kind: "swallow" })
    shuttingDown.wake()
    await running
    await shuttingDown.stop()
    // It runs again at the next start, without counting a try.
    expect(await load(cutOff.id)).toMatchObject({
      status: "queued",
      attempts: 0,
    })
  })

  test("waitFor says how a job ended, or nothing if it takes too long", async () => {
    let letItGo!: () => void
    const held = new Promise<void>((resolve) => (letItGo = resolve))
    const jobs = runner([
      { kind: "quick", run: async () => {} },
      { kind: "held", run: () => held },
    ])
    const quick = await enqueue(em(), { kind: "quick" })
    const slow = await enqueue(em(), { kind: "held" })
    const quickEnds = jobs.waitFor(quick.id, 5_000)
    const draining = jobs.drain()
    expect(await quickEnds).toBe("done")
    expect(await jobs.waitFor(slow.id, 50)).toBeNull()
    letItGo()
    await draining
    // One already over says how it ended at once.
    expect(await jobs.waitFor(quick.id, 50)).toBe("done")
  })

  test("everything a job calls sees its stop signal", async () => {
    let seen: AbortSignal | undefined
    let own: AbortSignal | undefined
    const jobs = runner([
      {
        kind: "look",
        run: async ({ signal }) => {
          own = signal
          await Promise.resolve()
          seen = stopSignal()
        },
      },
    ])
    await enqueue(em(), { kind: "look" })
    await jobs.drain()
    expect(seen).toBeDefined()
    expect(seen).toBe(own)
  })

  test("adds one job per key while it's waiting or running", async () => {
    const first = await enqueue(em(), { kind: "x", key: "only-one" })
    const second = await enqueue(em(), { kind: "x", key: "only-one" })
    expect(second.id).toBe(first.id)
  })

  test("can stop a job waiting or running", async () => {
    const jobs = runner([
      {
        kind: "long",
        run: ({ signal }) =>
          new Promise((_, reject) =>
            signal.addEventListener("abort", () => reject(signal.reason))
          ),
      },
    ])
    const waiting = await enqueue(em(), {
      kind: "long",
      runAt: new Date(Date.now() + 60_000),
    })
    const tx = em()
    await cancelJob(tx, await tx.findOneOrFail(Job, { id: waiting.id }), (id) =>
      jobs.stopJob(id)
    )
    expect((await load(waiting.id)).status).toBe("cancelled")

    const running = await enqueue(em(), { kind: "long" })
    const draining = jobs.drain()
    await expect
      .poll(async () => (await load(running.id)).status)
      .toBe("running")
    await cancelJob(em(), await load(running.id), (id) => jobs.stopJob(id))
    await draining
    expect((await load(running.id)).status).toBe("cancelled")
  })

  test("runs jobs cut off by a restart again, without counting a try", async () => {
    const job = await enqueue(em(), { kind: "resume" })
    await em().nativeUpdate(
      Job,
      { id: job.id },
      { status: "running", attempts: 1 }
    )
    const jobs = runner([{ kind: "resume", run: async () => ({ ok: true }) }])
    await jobs.start()
    await jobs.drain()
    await jobs.stop()

    expect(await load(job.id)).toMatchObject({ status: "done", attempts: 1 })
  })

  test("keeps the next run of a schedule waiting", async () => {
    let runs = 0
    const jobs = runner([{ kind: "nightly", run: async () => void runs++ }], {
      schedules: [{ kind: "nightly", cron: "0 3 * * *" }],
    })
    await jobs.start()
    const [next] = await em().find(Job, { kind: "nightly" })
    expect(next).toMatchObject({ status: "queued", key: "schedule:nightly" })
    expect(next!.runAt.getTime()).toBeGreaterThan(Date.now())

    // Its time comes: it runs, and the one after is waiting.
    await em().nativeUpdate(Job, { id: next!.id }, { runAt: new Date() })
    await jobs.drain()
    await jobs.stop()
    expect(runs).toBe(1)
    const after = await em().find(Job, { kind: "nightly", status: "queued" })
    expect(after).toHaveLength(1)
    expect(after[0]!.id).not.toBe(next!.id)
  })

  test("fails jobs it doesn't know how to run", async () => {
    const job = await enqueue(em(), { kind: "mystery" })
    await runner([]).drain()
    expect(await load(job.id)).toMatchObject({
      status: "failed",
      error: 'Merran doesn\'t know how to run "mystery" jobs.',
    })
  })

  test("leaves stopped jobs to run next time when shutting down", async () => {
    const jobs = runner([
      {
        kind: "long",
        run: ({ signal }) =>
          new Promise((_, reject) =>
            signal.addEventListener("abort", () => reject(new JobStopped()))
          ),
      },
    ])
    const job = await enqueue(em(), { kind: "long" })
    await jobs.start()
    await expect.poll(async () => (await load(job.id)).status).toBe("running")
    await jobs.stop()

    expect(await load(job.id)).toMatchObject({ status: "queued", attempts: 0 })
  })

  test("leaves a job it was taking as shutdown began to run next time", async () => {
    // Shutting down stops the jobs already running; one being taken at
    // that moment isn't running yet, so it must not start after it.
    let ran = false
    let stopping: Promise<void> | null = null
    const jobs: JobRunner = runner(
      [
        {
          kind: "long",
          run: async () => {
            ran = true
          },
        },
      ],
      {
        beforeTaking: async () => {
          stopping = jobs.stop()
        },
      }
    )
    const job = await enqueue(em(), { kind: "long" })
    await jobs.start()
    await expect.poll(() => stopping !== null).toBe(true)
    await stopping

    expect(ran).toBe(false)
    expect(await load(job.id)).toMatchObject({
      status: "queued",
      attempts: 0,
      startedAt: null,
    })
  })

  test("a job started over while it runs runs again from its first try", async () => {
    // However the try under way ends: done, failing with tries left, or
    // failing its last.
    for (const ending of ["done", "retry", "last"] as const) {
      let letItEnd!: () => void
      const held = new Promise<void>((resolve) => (letItEnd = resolve))
      const tries: number[] = []
      const jobs = runner([
        {
          kind: "held",
          run: async ({ attempt }) => {
            tries.push(attempt)
            // Only the try under way is held; the one after just runs.
            if (tries.length > 1) return
            await held
            if (ending !== "done") throw new Error(`Broke on try ${attempt}`)
          },
        },
      ])
      const job = await enqueue(em(), { kind: "held", maxAttempts: 3 })
      if (ending === "last") {
        await em().nativeUpdate(Job, { id: job.id }, { attempts: 2 })
      }
      const draining = jobs.drain()
      await expect.poll(async () => (await load(job.id)).status).toBe("running")

      const tx = em()
      await restartJob(tx, await tx.findOneOrFail(Job, { id: job.id }))
      letItEnd()
      await draining

      expect(tries, ending).toEqual([ending === "last" ? 3 : 1, 1])
      expect(await load(job.id), ending).toMatchObject({
        status: "done",
        attempts: 1,
      })
    }
  })

  test("a job started over while it runs keeps its fresh start through a shutdown", async () => {
    const jobs = runner([
      {
        kind: "long",
        run: ({ signal }) =>
          new Promise((_, reject) =>
            signal.addEventListener("abort", () => reject(new JobStopped()))
          ),
      },
    ])
    const job = await enqueue(em(), { kind: "long", maxAttempts: 3 })
    await em().nativeUpdate(Job, { id: job.id }, { attempts: 2 })
    await jobs.start()
    await expect.poll(async () => (await load(job.id)).status).toBe("running")

    const tx = em()
    await restartJob(tx, await tx.findOneOrFail(Job, { id: job.id }))
    await jobs.stop()

    expect(await load(job.id)).toMatchObject({ status: "queued", attempts: 0 })
  })
})
