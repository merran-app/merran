import type { MockLanguageModelV4 } from "ai/test"
import sharp from "sharp"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import { Job, Receipt } from "../../../database/entities/index.ts"
import type { Database } from "../../../database/orm.ts"
import { ACROSS_HOUSEHOLDS, forHousehold } from "../../../database/scope.ts"
import { fakeAiFetcher, GOOD_KEYS, mockAiModels } from "../../../test/ai.ts"
import { createTestApp, setUpServer } from "../../../test/app.ts"
import type { AiModels } from "../../ai/providers.ts"
import { JobRunner } from "../../jobs/runner.ts"
import { stopSignal } from "../../jobs/stop.ts"
import { LocalFileStore } from "../../storage/files.ts"
import { addReceipt, listReceipts, scanReceipt } from "./receipts.ts"

// A scanned receipt as a job: read while the request waits, or handed over,
// with the receipt saying it's being read until it is.

const MILK = {
  what: "receipt",
  store: "Walmart",
  date: "2026-10-14",
  total: 3.48,
  items: [
    {
      text: "GV WHL MLK 1GAL",
      name: "whole milk",
      amount: "1 gal",
      price: 3.48,
      kind: "food",
    },
  ],
}

/** What the fake model says it read. */
let read: unknown = MILK

/** The fake model's answers are held while a test has the gate closed. */
let release: (() => void) | null = null
let gate: Promise<void> | null = null
const holdModel = () => {
  gate = new Promise<void>((resolve) => {
    release = resolve
  })
}
const releaseModel = () => {
  release?.()
  gate = null
}

/** How many times the model has been asked. */
let asked = 0

/**
 * Waits at the gate, as a slow model does. A job that's stopped meanwhile
 * ends with its reason, as the real call does.
 */
function atTheGate() {
  const waiting = gate
  const stop = stopSignal()
  if (!waiting) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    if (stop?.aborted) {
      reject(stop.reason)
      return
    }
    stop?.addEventListener("abort", () => reject(stop.reason))
    void waiting.then(resolve)
  })
}

const plain = mockAiModels(undefined, [], undefined, () => JSON.stringify(read))
const models: AiModels = (target) => {
  const model = plain(target) as MockLanguageModelV4
  const generate = model.doGenerate
  model.doGenerate = async (...args: Parameters<typeof generate>) => {
    asked++
    await atTheGate()
    return generate.apply(model, args)
  }
  return model
}

/** A server of its own, signed in, with a key for the model. */
async function setUp() {
  const test = await createTestApp({ fetcher: fakeAiFetcher(), ai: models })
  const kyle = await setUpServer(test.app, test.setupCode)
  const home = (await (await kyle.get("/api/households/current")).json()).id
  const userId = (await (await kyle.get("/api/auth/me")).json()).id
  const key = await kyle.post("/api/settings/server/ai/keys", {
    provider: "anthropic",
    key: GOOD_KEYS.anthropic,
  })
  expect(key.status, await key.clone().text()).toBe(201)
  const files = new LocalFileStore(test.filesDir)
  return { ...test, kyle, home, userId, files }
}

let jpeg: Buffer

beforeAll(async () => {
  jpeg = await sharp({
    create: { width: 600, height: 800, channels: 3, background: "#eee" },
  })
    .jpeg()
    .toBuffer()
})

const uploadOf = (home: string, receiptId: string, index = 0) =>
  `receipts/${home}/${receiptId}/upload/${index}`

describe("scanning a receipt as a job", () => {
  let database: Database
  let close: () => Promise<void>
  let jobs: JobRunner
  let files: LocalFileStore
  let home: string
  let userId: string

  const em = () => forHousehold(database.em, home)

  const scan = (
    handoverMs: number,
    input = { files: [{ body: jpeg, type: "image/jpeg" }], text: null as null }
  ) =>
    scanReceipt(
      em(),
      { jobs, files },
      { householdId: home, userId, input },
      { handoverMs }
    )

  const load = (receiptId: string) =>
    em().findOneOrFail(Receipt, { id: receiptId }, { refresh: true })

  beforeAll(async () => {
    const server = await setUp()
    ;({ database, close, jobs, files, home, userId } = server)
  }, 60_000)

  // Each test starts with nothing held, the usual receipt, no receipts or
  // jobs left over from another, and nothing still running.
  beforeEach(async () => {
    releaseModel()
    read = MILK
    await jobs.drain()
    await em().nativeDelete(Receipt, {})
  })

  afterAll(() => close())

  test("a receipt read within the wait is done, ready, with its lines", async () => {
    const result = await scan(5_000)
    expect("done" in result).toBe(true)
    if (!("done" in result)) return
    expect(result.done).toMatchObject({
      status: "ready",
      error: null,
      store: "Walmart",
      lines: [{ name: "whole milk", amount: "1 gal" }],
      files: [{ mediaType: "image/jpeg" }],
    })
    // Its uploads were only for the job.
    expect(await files.read(uploadOf(home, result.done.id))).toBeNull()
  })

  test("a receipt that takes longer starts reading, and is ready once the job's done", async () => {
    holdModel()
    const result = await scan(50)
    expect("started" in result).toBe(true)
    if (!("started" in result)) return
    expect(result.started).toMatchObject({
      status: "reading",
      error: null,
      lines: [],
    })
    expect(await listReceipts(em())).toMatchObject([
      { id: result.started.id, status: "reading" },
    ])
    // Its photo waits where the job will find it.
    expect(await files.read(uploadOf(home, result.started.id))).not.toBeNull()

    releaseModel()
    await jobs.drain()
    expect(await load(result.started.id)).toMatchObject({
      status: "ready",
      store: "Walmart",
      lines: [{ name: "whole milk" }],
    })
    expect(await files.read(uploadOf(home, result.started.id))).toBeNull()
    expect(
      await files.read(`receipts/${home}/${result.started.id}/0`)
    ).not.toBe(null)
  })

  test("a recipe found after the wait says so on the receipt", async () => {
    read = { ...MILK, what: "recipe", items: [] }
    holdModel()
    const result = await scan(50)
    expect("started" in result).toBe(true)
    if (!("started" in result)) return

    releaseModel()
    await jobs.drain()
    expect(await load(result.started.id)).toMatchObject({
      status: "recipe",
      lines: [],
    })
    await expect(
      addReceipt(em(), files, {
        householdId: home,
        receiptId: result.started.id,
        items: [{ id: "any", name: "milk", amount: null }],
      })
    ).rejects.toMatchObject({ code: "receipt_not_found" })
    expect(await files.read(uploadOf(home, result.started.id))).toBeNull()
  })

  test("a recipe found within the wait is thrown as 422 and not kept", async () => {
    read = { ...MILK, what: "recipe", items: [] }
    await expect(scan(5_000)).rejects.toMatchObject({
      kind: "unprocessable",
      code: "receipt_is_recipe",
    })
    read = { ...MILK, what: "other", items: [] }
    await expect(scan(5_000)).rejects.toMatchObject({
      kind: "unprocessable",
      code: "not_a_receipt",
    })
    expect(await listReceipts(em())).toEqual([])
  })

  test("a receipt that can't be read after the wait says why", async () => {
    // An answer that isn't a receipt's form at all.
    read = "gibberish"
    holdModel()
    const result = await scan(50)
    expect("started" in result).toBe(true)
    if (!("started" in result)) return

    releaseModel()
    await jobs.drain()
    expect(await load(result.started.id)).toMatchObject({
      status: "failed",
      error: expect.stringContaining("couldn't be read"),
      lines: [],
    })
    expect(await files.read(uploadOf(home, result.started.id))).toBeNull()
  })

  test("a file that can't be read, within the wait, answers 400 and isn't kept", async () => {
    await expect(
      scan(5_000, {
        files: [{ body: Buffer.from("not a photo"), type: "image/png" }],
        text: null,
      })
    ).rejects.toMatchObject({ kind: "invalid", code: "not_a_receipt_file" })
    expect(await listReceipts(em())).toEqual([])
  })

  test("nothing to read, too many files and a big PDF fail at once, with no receipt or job", async () => {
    const jobsBefore = () =>
      database.em
        .fork()
        .count(Job, { kind: "pantry.readReceipt" }, ACROSS_HOUSEHOLDS)
    const before = await jobsBefore()
    const photo = { body: jpeg, type: "image/jpeg" }

    await expect(scan(50, { files: [], text: null })).rejects.toMatchObject({
      code: "no_receipt",
    })
    await expect(
      scan(50, { files: Array.from({ length: 7 }, () => photo), text: null })
    ).rejects.toMatchObject({ code: "too_many_files" })
    const bigPdf = Buffer.concat([
      Buffer.from("%PDF-1.7 "),
      Buffer.alloc(10_000_001),
    ])
    await expect(
      scan(50, {
        files: [{ body: bigPdf, type: "application/pdf" }],
        text: null,
      })
    ).rejects.toMatchObject({ code: "file_too_large" })

    expect(await em().count(Receipt, {})).toBe(0)
    expect(await jobsBefore()).toBe(before)
  })

  test("a receipt discarded while it's read leaves nothing behind", async () => {
    holdModel()
    const result = await scan(50)
    expect("started" in result).toBe(true)
    if (!("started" in result)) return
    const receipt = await load(result.started.id)
    await em().remove(receipt).flush()

    releaseModel()
    await jobs.drain()
    expect(await em().count(Receipt, {})).toBe(0)
    expect(await files.read(uploadOf(home, result.started.id))).toBeNull()
    expect(await files.read(`receipts/${home}/${result.started.id}/0`)).toBe(
      null
    )
  })
})

// Its own server: it stops the runner, as Merran does when it shuts down.
describe("a receipt cut off by a restart", () => {
  let server: Awaited<ReturnType<typeof setUp>>

  beforeAll(async () => {
    server = await setUp()
  }, 60_000)

  afterAll(() => server.close())

  test("is read at the next start, from the uploads, which are then removed", async () => {
    const { database, jobs, files, home, userId, jobDeps, jobHandlers } = server
    const em = () => forHousehold(database.em, home)
    read = MILK
    holdModel()
    const result = await scanReceipt(
      em(),
      { jobs, files },
      {
        householdId: home,
        userId,
        input: { files: [{ body: jpeg, type: "image/jpeg" }], text: null },
      },
      { handoverMs: 50 }
    )
    expect("started" in result).toBe(true)
    if (!("started" in result)) return
    const receiptId = result.started.id

    // Stopped while the model has it, not on its way there.
    await expect.poll(() => asked, { timeout: 3_000 }).toBeGreaterThan(0)
    await jobs.stop()

    // Cut off: not failed, not saved, and its photo still there to read.
    const cut = await em().findOneOrFail(
      Receipt,
      { id: receiptId },
      { refresh: true }
    )
    expect(cut).toMatchObject({ status: "reading", error: null })
    expect(await files.read(uploadOf(home, receiptId))).not.toBeNull()
    const job = await em().findOneOrFail(
      Job,
      { kind: "pantry.readReceipt" },
      { refresh: true }
    )
    expect(job.status).toBe("queued")

    // The next start: a new runner picks it up.
    releaseModel()
    const next = new JobRunner({ deps: jobDeps, handlers: jobHandlers })
    await next.drain()
    expect(
      await em().findOneOrFail(Receipt, { id: receiptId }, { refresh: true })
    ).toMatchObject({
      status: "ready",
      lines: [{ name: "whole milk" }],
    })
    expect(await files.read(uploadOf(home, receiptId))).toBeNull()
    expect(await files.read(`receipts/${home}/${receiptId}/0`)).not.toBeNull()
  })
})
