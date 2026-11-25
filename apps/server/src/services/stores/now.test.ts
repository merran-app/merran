import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import {
  Job,
  StoreConnection,
  StoreProduct,
} from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { ACROSS_HOUSEHOLDS, forHousehold } from "../../database/scope.ts"
import { createTestApp, setUpServer, type TestClient } from "../../test/app.ts"
import type { Fetcher } from "../fetch/public-fetch.ts"
import { ACTIVE, enqueue } from "../jobs/jobs.ts"
import type { JobRunner } from "../jobs/runner.ts"
import { CHECK_PRICES } from "./kroger/connection.ts"
import { checkPricesNow } from "./prices.ts"

// Checking prices now as a job: done while the request waits, or handed
// over, with the stores saying it's checking until it's done.

const KROGER = "https://api.kroger.com/v1"

const LOCATION = {
  locationId: "70500822",
  chain: "FRYS",
  name: "Fry's Food Stores - 20th St",
  address: { addressLine1: "4724 N 20th St", city: "Phoenix", state: "AZ" },
}

/** Kroger's product answers are held while a test has the gate closed. */
let release: (() => void) | null = null
let gate: Promise<void> = Promise.resolve()
const holdKroger = () => {
  gate = new Promise<void>((resolve) => {
    release = resolve
  })
}
const releaseKroger = () => release?.()

/** Kroger says its daily limit is used up. */
let limited = false

const fetcher: Fetcher = async (url) => {
  const answer = (status: number, body?: unknown) => ({
    url,
    status,
    contentType: "application/json",
    body: Buffer.from(body === undefined ? "" : JSON.stringify(body)),
  })
  if (!url.startsWith(KROGER)) return answer(404, {})
  const path = url.slice(KROGER.length)
  if (path === "/connect/oauth2/token") {
    return answer(200, { access_token: "app-token", expires_in: 1800 })
  }
  if (path.startsWith("/locations/")) return answer(200, { data: LOCATION })
  if (path.startsWith("/products?")) {
    await gate
    if (limited) return answer(429, {})
    return answer(200, { data: [] })
  }
  return answer(404, {})
}

let database: Database
let close: () => Promise<void>
let jobs: JobRunner
let settings: Parameters<typeof checkPricesNow>[0]["settings"]
let home: string
let userId: string
let kyle: TestClient

const em = () => forHousehold(database.em, home)

const deps = () => ({ jobs, settings, fetcher, ai: undefined as never })

const checkNow = (handoverMs: number) =>
  checkPricesNow(deps(), em(), { householdId: home, userId }, { handoverMs })

const status = async () => (await (await kyle.get("/api/stores")).json()).kroger

const activeChecks = () =>
  em().find(Job, { kind: CHECK_PRICES, status: { $in: [...ACTIVE] } })

/** A product the household keeps, so a check has something to ask Kroger about. */
async function keepAProduct() {
  const scoped = em()
  if (await scoped.count(StoreProduct, { food: "milk" })) return
  scoped.create(StoreProduct, {
    household: home,
    store: "kroger",
    food: "milk",
    chosen: true,
    product: {
      id: "milk1",
      upc: null,
      name: "Milk",
      brand: null,
      size: "1 gal",
      image: null,
      price: 349,
      salePrice: null,
      saleEnds: null,
      currency: "USD",
      aisle: null,
      inStock: true,
      url: null,
    },
  })
  await scoped.flush()
}

beforeAll(async () => {
  const test = await createTestApp({ fetcher })
  ;({ database, close, jobs, settings } = test)
  kyle = await setUpServer(test.app, test.setupCode)
  home = (await (await kyle.get("/api/households/current")).json()).id
  userId = (await (await kyle.get("/api/auth/me")).json()).id
  const app = await kyle.patch("/api/settings/server", {
    "stores.krogerClientId": "merran-test",
    "stores.krogerClientSecret": "kroger-test-secret",
  })
  expect(app.status, await app.clone().text()).toBe(200)
  const picked = await kyle.put("/api/stores/kroger", {
    locationId: LOCATION.locationId,
  })
  expect(picked.status, await picked.clone().text()).toBe(200)
})

// Each test starts with nothing held, no limit, no check left over (picking
// the store queued one), and a product kept.
beforeEach(async () => {
  releaseKroger()
  gate = Promise.resolve()
  limited = false
  await jobs.drain()
  await keepAProduct()
})

afterAll(() => close())

describe("checking prices now", () => {
  test("a check done within the wait answers with what it found, as before", async () => {
    const res = await kyle.post("/api/stores/kroger/prices")
    expect(res.status, await res.clone().text()).toBe(200)
    expect(await res.json()).toEqual({ refreshed: 0, searched: 0, deals: 0 })
    expect((await status()).checkingPrices).toBe(false)
  })

  test("no store picked still answers 422 at once, with no job made", async () => {
    const scoped = em()
    const connection = await scoped.findOneOrFail(StoreConnection, {
      store: "kroger",
    })
    connection.location = null
    await scoped.flush()
    try {
      const before = await database.em
        .fork()
        .count(Job, { kind: CHECK_PRICES }, ACROSS_HOUSEHOLDS)
      const res = await kyle.post("/api/stores/kroger/prices")
      expect(res.status).toBe(422)
      expect((await res.json()).error.code).toBe("kroger_no_store")
      expect(
        await database.em
          .fork()
          .count(Job, { kind: CHECK_PRICES }, ACROSS_HOUSEHOLDS)
      ).toBe(before)
    } finally {
      // Picking it again puts it back, and asks for a check, which the next
      // test's setup lets finish.
      const picked = await kyle.put("/api/stores/kroger", {
        locationId: LOCATION.locationId,
      })
      expect(picked.status, await picked.clone().text()).toBe(200)
    }
  })

  test("Kroger's daily limit, met in the job, answers 429 to the waiting request", async () => {
    limited = true
    const res = await kyle.post("/api/stores/kroger/prices")
    expect(res.status, await res.clone().text()).toBe(429)
    expect((await res.json()).error.code).toBe("kroger_limit")
    // The job itself didn't break: it was refused, and it's over.
    expect(await activeChecks()).toEqual([])
  })

  test("a longer check hands over, and the stores say it's checking", async () => {
    holdKroger()
    const result = await checkNow(50)
    expect("started" in result).toBe(true)
    expect((await status()).checkingPrices).toBe(true)

    releaseKroger()
    await jobs.drain()
    expect((await status()).checkingPrices).toBe(false)
    const job = await em().findOneOrFail(
      Job,
      { id: "started" in result ? result.started.id : "" },
      { refresh: true }
    )
    expect(job).toMatchObject({ status: "done", result: { refreshed: 0 } })
  })

  test("pressing it twice shares one job", async () => {
    holdKroger()
    const first = await checkNow(50)
    const second = await checkNow(50)
    expect("started" in first && "started" in second).toBe(true)
    if (!("started" in first) || !("started" in second)) return
    expect(second.started.id).toBe(first.started.id)
    expect(await activeChecks()).toHaveLength(1)

    releaseKroger()
    await jobs.drain()
  })

  test("a check already waiting is joined, and becomes the person's own", async () => {
    // As a store change or the half-hourly look queues it: nobody's waiting,
    // and it isn't due yet, so the runner leaves it for the person's press.
    await enqueue(em(), {
      kind: CHECK_PRICES,
      householdId: home,
      key: `${CHECK_PRICES}:${home}`,
      maxAttempts: 1,
      runAt: new Date(Date.now() + 60_000),
    })
    const [waiting] = await activeChecks()
    expect(waiting!.status).toBe("queued")
    expect(waiting!.payload).toEqual({})

    // Joined, it's the person's check: a 429 met in it reaches the request.
    limited = true
    await expect(checkNow(5_000)).rejects.toMatchObject({
      kind: "rate_limited",
      code: "kroger_limit",
    })
    const after = await em().findOneOrFail(
      Job,
      { id: waiting!.id },
      { refresh: true }
    )
    expect(after.status).toBe("done")
    expect(after.createdBy?.id).toBe(userId)
    expect(after.payload).toMatchObject({ now: true, userId })
    // One job, not a second beside it.
    expect(
      await em().count(Job, { kind: CHECK_PRICES, createdAt: after.createdAt })
    ).toBe(1)
  })
})
