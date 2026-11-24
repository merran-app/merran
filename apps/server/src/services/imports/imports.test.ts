import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import {
  Household,
  Import,
  ImportItem,
  Job,
  Recipe,
} from "../../database/entities/index.ts"
import type { Database } from "../../database/orm.ts"
import { forHousehold } from "../../database/scope.ts"
import { createTestDatabase } from "../../test/database.ts"
import {
  addItem,
  clearOldImports,
  createImport,
  ensureImport,
  finishImport,
  settleItem,
} from "./imports.ts"

let database: Database
let close: () => Promise<void>
let home: string
let soup: string
let stew: string

beforeAll(async () => {
  ;({ database, close } = await createTestDatabase())
  const em = database.em.fork()
  const household = em.create(Household, { name: "Home", slug: "home" })
  soup = em.create(Recipe, {
    household,
    slug: "soup",
    name: "Soup",
    origin: "link",
  }).id
  stew = em.create(Recipe, {
    household,
    slug: "stew",
    name: "Stew",
    origin: "link",
  }).id
  await em.flush()
  home = household.id
})

afterAll(() => close())

const em = () => forHousehold(database.em, home)

beforeEach(async () => {
  await em().nativeDelete(Import, {})
})

/** An import of several links, saved. */
async function linksImport(urls: string[], listed = true) {
  const tx = em()
  const record = createImport(tx, {
    id: randomUUID(),
    householdId: home,
    kind: "links",
    source: null,
    createdBy: null,
    listed,
    items: urls.map((url) => ({ label: url, ref: url })),
  })
  await tx.flush()
  return record.id
}

const items = (importId: string) =>
  em().find(ImportItem, { import: importId }, { orderBy: { position: "asc" } })

describe("an import's record", () => {
  test("keeps its items in order and counts them as they settle", async () => {
    const id = await linksImport([
      "https://a.test",
      "https://b.test",
      "https://c.test",
    ])
    await settleItem(em(), id, 0, { state: "added", recipeId: soup })
    await settleItem(em(), id, 1, { state: "already", recipeId: stew })
    await settleItem(em(), id, 2, {
      state: "failed",
      error: "Couldn't reach that site.",
    })

    expect(await em().findOneOrFail(Import, { id })).toMatchObject({
      total: 3,
      added: 1,
      already: 1,
      failed: 1,
    })
    expect(
      (await items(id)).map((item) => [
        item.label,
        item.state,
        item.recipe?.id ?? null,
        item.error,
      ])
    ).toEqual([
      ["https://a.test", "added", soup, null],
      ["https://b.test", "already", stew, null],
      ["https://c.test", "failed", null, "Couldn't reach that site."],
    ])
  })

  test("takes items added as it goes in the next places", async () => {
    const id = await linksImport([])
    await addItem(em(), id, {
      label: "Soup",
      ref: "mealie:1",
      state: "added",
      recipeId: soup,
    })
    await addItem(em(), id, {
      label: "Broken pie",
      ref: "mealie:2",
      state: "failed",
      error: "It has no name.",
    })

    expect((await items(id)).map((item) => [item.position, item.ref])).toEqual([
      [0, "mealie:1"],
      [1, "mealie:2"],
    ])
    expect(await em().findOneOrFail(Import, { id })).toMatchObject({
      total: 2,
      added: 1,
      failed: 1,
    })
  })

  test("keeps an item whose recipe was deleted for good, without the recipe", async () => {
    const tx = em()
    const pie = tx.create(Recipe, {
      household: home,
      slug: "pie",
      name: "Pie",
      origin: "link",
    })
    await tx.flush()
    const id = await linksImport(["https://pie.test"])
    await settleItem(em(), id, 0, { state: "added", recipeId: pie.id })

    await em().nativeDelete(Recipe, { id: pie.id })
    const [item] = await items(id)
    expect(item).toMatchObject({ state: "added", recipe: null })
  })

  test("deleting it deletes its items, and never a recipe", async () => {
    const id = await linksImport(["https://a.test"])
    await settleItem(em(), id, 0, { state: "added", recipeId: soup })

    await em().nativeDelete(Import, { id })
    expect(await em().count(ImportItem, { import: id })).toBe(0)
    expect(await em().count(Recipe, { id: soup })).toBe(1)
  })

  test("ends with how it went", async () => {
    const id = await linksImport(["https://a.test"])
    await finishImport(em(), id, { status: "failed", error: "It broke." })
    const record = await em().findOneOrFail(Import, { id })
    expect(record).toMatchObject({ status: "failed", error: "It broke." })
    expect(record.finishedAt).toBeInstanceOf(Date)
  })

  test("old records and unlisted ones are cleared", async () => {
    const now = new Date("2026-11-15T12:00:00Z")
    const daysAgo = (days: number) =>
      new Date(now.getTime() - days * 24 * 60 * 60_000)
    const old = await linksImport([])
    const recent = await linksImport([])
    const unlistedOld = await linksImport([], false)
    const unlistedNew = await linksImport([], false)
    const tx = em()
    await tx.nativeUpdate(Import, { id: old }, { createdAt: daysAgo(91) })
    await tx.nativeUpdate(Import, { id: recent }, { createdAt: daysAgo(89) })
    await tx.nativeUpdate(
      Import,
      { id: unlistedOld },
      { createdAt: new Date(now.getTime() - 25 * 60 * 60_000) }
    )
    await tx.nativeUpdate(
      Import,
      { id: unlistedNew },
      { createdAt: new Date(now.getTime() - 60 * 60_000) }
    )

    expect(await clearOldImports(database.em.fork(), now)).toBe(2)
    const left = await database.em.fork().find(Import, {}, { filters: false })
    expect(left.map((record) => record.id).sort()).toEqual(
      [recent, unlistedNew].sort()
    )
  })

  test("a job without a record gets one, once", async () => {
    const tx = database.em.fork()
    const job = tx.create(Job, {
      kind: "recipes.importLinks",
      payload: {},
      forHousehold: home,
      runAt: new Date(),
    })
    await tx.flush()

    const ofJob = { id: job.id, householdId: home, createdBy: null }
    const made = await ensureImport(em(), ofJob, {
      kind: "links",
      source: null,
      listed: true,
    })
    const again = await ensureImport(em(), ofJob, {
      kind: "links",
      source: null,
      listed: true,
    })
    expect(made.id).toBe(job.id)
    expect(again.id).toBe(job.id)
    expect(await em().count(Import, { id: job.id })).toBe(1)
  })
})
