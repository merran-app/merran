import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createTestDatabase } from "../test/database.ts"
import { atCommit } from "./at-commit.ts"
import { Job } from "./entities/index.ts"
import type { Database } from "./orm.ts"

let database: Database
let close: () => Promise<void>

beforeAll(async () => {
  ;({ database, close } = await createTestDatabase())
})

afterAll(() => close())

/** Work that notes it ran, under its key. */
function noting(ran: string[], key: string) {
  return async () => {
    ran.push(key)
  }
}

describe("atCommit", () => {
  test("runs each key's work once, in key order, as the transaction commits", async () => {
    const ran: string[] = []

    await database.em.fork().transactional(async (tx) => {
      expect(atCommit(tx, "b", noting(ran, "b"))).toBe(true)
      expect(atCommit(tx, "a", noting(ran, "a"))).toBe(true)
      expect(atCommit(tx, "b", noting(ran, "b again"))).toBe(true)
      expect(ran).toEqual([])
    })

    expect(ran).toEqual(["a", "b"])
  })

  test("saves what the work makes, in the transaction", async () => {
    await database.em.fork().transactional(async (tx) => {
      atCommit(tx, "job", async (commitTx) => {
        commitTx.create(Job, {
          kind: "test.at-commit",
          payload: {},
          runAt: new Date(),
        })
      })
    })

    expect(
      await database.em.fork().count(Job, { kind: "test.at-commit" })
    ).toBe(1)
  })

  test("runs nothing when the transaction rolls back", async () => {
    const ran: string[] = []

    await expect(
      database.em.fork().transactional(async (tx) => {
        atCommit(tx, "a", noting(ran, "a"))
        throw new Error("Rolled back")
      })
    ).rejects.toThrow("Rolled back")

    expect(ran).toEqual([])
  })

  test("a savepoint's work waits for the transaction around it", async () => {
    const ran: string[] = []

    await database.em.fork().transactional(async (tx) => {
      await tx.transactional(async (savepoint) => {
        atCommit(savepoint, "kept", noting(ran, "kept"))
      })
      await expect(
        tx.transactional(async (savepoint) => {
          atCommit(savepoint, "dropped", noting(ran, "dropped"))
          throw new Error("Rolled back to the savepoint")
        })
      ).rejects.toThrow("Rolled back to the savepoint")
      expect(ran).toEqual([])
    })

    expect(ran).toEqual(["kept"])
  })

  test("outside a transaction, it leaves the work to the caller", () => {
    const ran: string[] = []

    expect(atCommit(database.em.fork(), "a", noting(ran, "a"))).toBe(false)
    expect(ran).toEqual([])
  })
})
