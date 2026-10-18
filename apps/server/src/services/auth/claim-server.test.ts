import { expect, test, vi } from "vitest"
import {
  Account,
  Household,
  ShoppingList,
  User,
} from "../../database/entities/index.ts"
import {
  account,
  createTestApp,
  TEST_PASSWORD,
  TestClient,
} from "../../test/app.ts"
import { claimServer } from "./claim-server.ts"
import { resetPassword } from "./reset-password.ts"

test("initial account, credentials and household roll back together", async () => {
  const test = await createTestApp()
  const em = test.database.em.fork()
  const original = em.transactional.bind(em)
  vi.spyOn(em, "transactional").mockImplementation((run, options) =>
    original(async (tx) => {
      const create = tx.create.bind(tx)
      vi.spyOn(tx, "create").mockImplementation(((
        entity: unknown,
        ...args: unknown[]
      ) => {
        if (entity === ShoppingList) throw new Error("disk full")
        return (create as Function)(entity, ...args)
      }) as typeof tx.create)
      return run(tx)
    }, options)
  )
  try {
    await expect(
      claimServer(em, test.auth, { ...account("owner"), household: "Home" })
    ).rejects.toThrow("disk full")
    const fresh = test.database.em.fork()
    expect(await fresh.count(User)).toBe(0)
    expect(await fresh.count(Account)).toBe(0)
    expect(await fresh.count(Household)).toBe(0)
    await claimServer(fresh, test.auth, {
      ...account("owner"),
      household: "Home",
    })
    expect(await test.database.em.fork().count(User)).toBe(1)
  } finally {
    vi.restoreAllMocks()
    await test.close()
  }
})

test("simultaneous setup submissions produce only one initial administrator", async () => {
  const test = await createTestApp()
  try {
    const code = test.setupCode.issue()
    const results = await Promise.all(
      ["one", "two"].map((name) =>
        new TestClient(test.app).post("/api/auth/setup", {
          ...account(name),
          code,
          household: "Home",
        })
      )
    )
    expect(results.map((res) => res.status).sort()).toEqual([201, 409])
    expect(await test.database.em.fork().count(User)).toBe(1)
    expect(await test.database.em.fork().count(Household)).toBe(1)
  } finally {
    await test.close()
  }
})

test("operator password reset invalidates old credentials and all sessions", async () => {
  const test = await createTestApp()
  try {
    const { setUpServer } = await import("../../test/app.ts")
    const owner = await setUpServer(test.app, test.setupCode)
    await resetPassword(
      test.database.em.fork(),
      test.auth,
      "kyle",
      "a different long password"
    )
    expect((await owner.get("/api/auth/me")).status).toBe(401)
    const client = new TestClient(test.app)
    expect(
      (
        await client.post("/api/auth/sign-in/username", {
          username: "kyle",
          password: TEST_PASSWORD,
        })
      ).status
    ).toBe(401)
    expect(
      (
        await client.post("/api/auth/sign-in/username", {
          username: "kyle",
          password: "a different long password",
        })
      ).status
    ).toBe(200)
    expect((await client.get("/api/auth/me")).status).toBe(200)
  } finally {
    await test.close()
  }
})

test("independent database transactions cannot both claim the server", async () => {
  const fixture = await createTestApp()
  try {
    const results = await Promise.allSettled(
      ["first", "second"].map((name) =>
        claimServer(fixture.database.em.fork(), fixture.auth, {
          ...account(name),
          household: "Home",
        })
      )
    )
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1)
    expect(await fixture.database.em.fork().count(User)).toBe(1)
    expect(await fixture.database.em.fork().count(Household)).toBe(1)
  } finally {
    await fixture.close()
  }
})
