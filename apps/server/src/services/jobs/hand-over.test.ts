import { pino } from "pino"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import { AppError } from "../../core/errors.ts"
import { Job } from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { createTestDatabase } from "../../test/database.ts"
import {
  failureOf,
  HANDOVER_MS,
  throwIfFailure,
  waitThenHandOver,
} from "./hand-over.ts"
import { enqueue } from "./jobs.ts"
import { JobRunner, type JobDeps, type JobHandler } from "./runner.ts"

// Waiting for any job, and handing it over when it takes too long.

let database: Database
let close: () => Promise<void>

beforeAll(async () => {
  ;({ database, close } = await createTestDatabase())
})

afterAll(() => close())

beforeEach(async () => {
  await database.em.fork().nativeDelete(Job, {})
})

function runner(handlers: JobHandler[]) {
  const deps = {
    logger: pino({ level: "silent" }),
    database,
  } as unknown as JobDeps
  return new JobRunner({ deps, handlers })
}

const em = () => database.em.fork()

describe("waiting for a job, then handing it over", () => {
  test("the wait is ten seconds", () => {
    expect(HANDOVER_MS).toBe(10_000)
  })

  test("a job done in time answers with what it returned", async () => {
    const jobs = runner([
      { kind: "quick", run: async () => ({ recipeId: "r1" }) },
    ])
    const job = await enqueue(em(), { kind: "quick", maxAttempts: 1 })
    const draining = jobs.drain()

    expect(await waitThenHandOver(em(), jobs, job.id)).toEqual({
      done: { recipeId: "r1" },
    })
    await draining
  })

  test("a job that returns a failure throws its error, with its status", async () => {
    const jobs = runner([
      {
        kind: "refused",
        run: async () =>
          failureOf(new AppError("unprocessable", "no_key", "No key.")),
      },
    ])
    const job = await enqueue(em(), { kind: "refused", maxAttempts: 1 })
    const draining = jobs.drain()

    await expect(waitThenHandOver(em(), jobs, job.id)).rejects.toMatchObject({
      kind: "unprocessable",
      code: "no_key",
      message: "No key.",
    })
    await draining
  })

  test("a job that failed throws, with the job's own words", async () => {
    const jobs = runner([
      {
        kind: "broken",
        run: async () => {
          throw new Error("The model fell over.")
        },
      },
    ])
    const job = await enqueue(em(), { kind: "broken", maxAttempts: 1 })
    const draining = jobs.drain()

    await expect(waitThenHandOver(em(), jobs, job.id)).rejects.toMatchObject({
      kind: "upstream",
      code: "job_failed",
      message: "The model fell over.",
    })
    await draining
  })

  test("a job that was stopped throws that it was", async () => {
    const jobs = runner([{ kind: "stopped", run: async () => {} }])
    const job = await enqueue(em(), { kind: "stopped", maxAttempts: 1 })
    await em().nativeUpdate(
      Job,
      { id: job.id },
      { status: "cancelled", finishedAt: new Date() }
    )

    await expect(waitThenHandOver(em(), jobs, job.id)).rejects.toMatchObject({
      kind: "conflict",
      code: "job_stopped",
      message: "It was stopped before it finished.",
    })
  })

  test("a job still going is handed over and marked so", async () => {
    let letItGo!: () => void
    const held = new Promise<void>((resolve) => (letItGo = resolve))
    const jobs = runner([{ kind: "slow", run: () => held }])
    const job = await enqueue(em(), { kind: "slow", maxAttempts: 1 })
    const draining = jobs.drain()

    const result = await waitThenHandOver(em(), jobs, job.id, { ms: 50 })

    expect(result).toMatchObject({ started: { id: job.id } })
    const saved = await em().findOneOrFail(Job, { id: job.id })
    expect(saved.handedOverAt).not.toBeNull()
    letItGo()
    await draining
  })

  test("a job that ends as the wait runs out answers as done", async () => {
    let letItGo!: () => void
    const held = new Promise<void>((resolve) => (letItGo = resolve))
    const jobs = runner([
      {
        kind: "just-late",
        run: async () => {
          await held
          return { recipeId: "r2" }
        },
      },
    ])
    const job = await enqueue(em(), { kind: "just-late", maxAttempts: 1 })
    const draining = jobs.drain()

    const result = await waitThenHandOver(em(), jobs, job.id, {
      ms: 50,
      // The job ends right after it's marked, before it's looked at again.
      afterHandOver: async () => {
        letItGo()
        await draining
      },
    })

    expect(result).toEqual({ done: { recipeId: "r2" } })
  })

  test("throwIfFailure lets an ordinary result through", () => {
    expect(() => throwIfFailure({ recipeId: "r1" })).not.toThrow()
    expect(() => throwIfFailure(null)).not.toThrow()
  })
})
