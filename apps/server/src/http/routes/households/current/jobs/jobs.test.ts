import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { App } from "../../../../../app.ts"
import { Job } from "../../../../../database/entities/index.ts"
import type { Database } from "../../../../../database/orm.ts"
import { enqueue } from "../../../../../services/jobs/jobs.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../../../test/app.ts"

let app: App
let close: () => Promise<void>
let database: Database
let kyle: TestClient
let jamie: TestClient
let home: string
let homeJob: string
let cabinJob: string

beforeAll(async () => {
  const test = await createTestApp()
  ;({ app, close, database } = test)
  kyle = await setUpServer(app, test.setupCode)
  jamie = await join(app, await inviteToken(kyle), account("jamie", "Jamie"))
  home = (await (await kyle.get("/api/households/current")).json()).id
  const cabin = (
    await (await kyle.post("/api/households", { name: "Cabin" })).json()
  ).id
  const later = new Date(Date.now() + 60_000)
  homeJob = (
    await enqueue(database.em.fork(), {
      kind: "test.waiting",
      householdId: home,
      runAt: later,
    })
  ).id
  cabinJob = (
    await enqueue(database.em.fork(), {
      kind: "test.waiting",
      householdId: cabin,
      runAt: later,
    })
  ).id
  // Back to Home: making a household switches the server admin to it.
  await kyle.post("/api/auth/organization/set-active", {
    organizationId: home,
  })
})

afterAll(() => close())

describe("a household's jobs", () => {
  test("can be followed by its admins, and only its own", async () => {
    const res = await kyle.get(`/api/households/current/jobs/${homeJob}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: homeJob, status: "queued" })

    expect(
      (await kyle.get(`/api/households/current/jobs/${cabinJob}`)).status
    ).toBe(404)
    expect(
      (await jamie.get(`/api/households/current/jobs/${homeJob}`)).status
    ).toBe(403)
  })

  test("are listed for its admins, newest first, and only its own", async () => {
    const failed = await enqueue(database.em.fork(), {
      kind: "test.broken",
      householdId: home,
      runAt: new Date(Date.now() + 60_000),
    })
    await database.em
      .fork()
      .nativeUpdate(Job, { id: failed.id }, { status: "failed" })

    const res = await kyle.get("/api/households/current/jobs")
    expect(res.status, await res.clone().text()).toBe(200)
    const { jobs } = (await res.json()) as { jobs: { id: string }[] }
    expect(jobs.map((job) => job.id)).toEqual([failed.id, homeJob])

    const onlyFailed = await kyle.get(
      "/api/households/current/jobs?status=failed"
    )
    expect(await onlyFailed.json()).toMatchObject({
      jobs: [{ id: failed.id, status: "failed" }],
    })
  })

  test("aren't listed for anyone who isn't a household admin", async () => {
    expect((await jamie.get("/api/households/current/jobs")).status).toBe(403)
  })

  test("can be stopped", async () => {
    const res = await kyle.post(
      `/api/households/current/jobs/${homeJob}/cancel`
    )
    expect(await res.json()).toMatchObject({ status: "cancelled" })
  })
})
