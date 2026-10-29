import { afterAll, beforeAll, expect, test } from "vitest"
import { AppError } from "../../../../../core/errors.ts"
import type { Fetcher } from "../../../../../services/fetch/public-fetch.ts"
import {
  account,
  createTestApp,
  inviteToken,
  join,
  setUpServer,
  TestClient,
} from "../../../../../test/app.ts"

/** A FlareSolverr at one address, and nothing at any other. */
const fetcher: Fetcher = async (url) => {
  if (url !== "http://flaresolverr:8191/v1") {
    throw new AppError(
      "upstream",
      "site_unreachable",
      "Couldn't reach that site."
    )
  }
  return {
    url,
    status: 200,
    contentType: "application/json",
    body: Buffer.from(
      JSON.stringify({ status: "ok", sessions: [], version: "3.3.21" })
    ),
  }
}

let fixture: Awaited<ReturnType<typeof createTestApp>>
let admin: TestClient
let member: TestClient
const path = "/api/settings/server/flaresolverr/test"

beforeAll(async () => {
  fixture = await createTestApp({ fetcher })
  admin = await setUpServer(fixture.app, fixture.setupCode)
  member = await join(fixture.app, await inviteToken(admin), account("member"))
})
afterAll(() => fixture.close())

const moduleState = async () => {
  const { modules } = await (await admin.get("/api/capabilities")).json()
  return modules.find((module: { id: string }) => module.id === "flaresolverr")
}
const save = (address: unknown) =>
  admin.patch("/api/settings/server", { "flaresolverr.url": address })

test("FlareSolverr is off until it has an address", async () => {
  expect(await moduleState()).toEqual({
    id: "flaresolverr",
    on: false,
    needs: "url",
  })
  const res = await admin.post(path)
  expect(res.status).toBe(400)
  expect((await res.json()).error.message).toMatch(/address isn't set/)
})

test("only server admins can test it or set its address", async () => {
  expect((await new TestClient(fixture.app).post(path)).status).toBe(401)
  expect((await member.post(path)).status).toBe(403)
  expect(
    (
      await member.patch("/api/settings/server", {
        "flaresolverr.url": "http://flaresolverr:8191",
      })
    ).status
  ).toBe(403)
})

test("takes only a full address", async () => {
  expect((await save("flaresolverr")).status).toBe(400)
  expect((await save("http://flaresolverr:8191")).status).toBe(200)
  expect(await moduleState()).toEqual({ id: "flaresolverr", on: true })
})

test("says which FlareSolverr answered, or why none did", async () => {
  const res = await admin.post(path)
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ version: "3.3.21" })

  expect((await save("http://elsewhere:8191")).status).toBe(200)
  const missing = await admin.post(path)
  expect(missing.status).toBe(502)
  expect((await missing.json()).error.message).toBe(
    "Couldn't reach FlareSolverr at http://elsewhere:8191."
  )
  expect((await save(null)).status).toBe(200)
})
