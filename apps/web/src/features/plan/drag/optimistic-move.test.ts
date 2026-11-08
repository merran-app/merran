import assert from "node:assert/strict"
import { test } from "node:test"
import { QueryClient } from "@tanstack/react-query"

import type { PlanEntry, PlanSnapshot } from "../queries"
import {
  optimisticMove,
  optimisticMoveUndo,
  optimisticOrder,
  optimisticSwap,
} from "./optimistic-move.ts"

const week = ["plan", "2026-10-19", "2026-10-25"]
const nextWeek = ["plan", "2026-10-26", "2026-11-01"]
const entry = (id: string, changes: Partial<PlanEntry> = {}) =>
  ({
    id,
    date: "2026-10-19",
    anyDay: true,
    meal: "dinner",
    position: 0,
    status: "planned",
    note: id,
    recipe: null,
    withRecipe: null,
    servings: 4,
    why: [],
    ...changes,
  }) as PlanEntry
const pick = ({ date, anyDay, meal, position }: PlanEntry) => ({
  date,
  anyDay,
  meal,
  position,
})
const read = (client: QueryClient, key = week) =>
  client.getQueryData<{ entries: PlanEntry[] }>(key)!.entries

test("moves immediately into an occupied slot and rolls back only that meal", async () => {
  const client = new QueryClient()
  const a = entry("a")
  const b = entry("b", { anyDay: false, date: "2026-10-20", meal: "lunch" })
  client.setQueryData(week, { entries: [a, b] })
  const rollback = await optimisticMove(client, [a.id], {
    date: b.date,
    meal: b.meal,
    anyDay: false,
  })
  assert.equal(read(client).find((row) => row.id === "a")!.position, 1)
  assert.equal(read(client).find((row) => row.id === "a")!.servings, 4)
  // A live change to another meal and a status change must survive rollback.
  client.setQueryData(week, {
    entries: read(client).map((row) =>
      row.id === "a"
        ? { ...row, status: "cooked" }
        : { ...row, note: "Updated" }
    ),
  })
  rollback()
  assert.deepEqual(
    read(client).find((row) => row.id === "a"),
    { ...a, status: "cooked" }
  )
  assert.equal(read(client).find((row) => row.id === "b")!.note, "Updated")
})

test("moves between cached weeks and Undo immediately restores the source", async () => {
  const client = new QueryClient()
  const a = entry("a")
  client.setQueryData(week, { entries: [a] })
  client.setQueryData(nextWeek, { entries: [] })
  await optimisticMove(client, [a.id], {
    date: "2026-10-27",
    anyDay: false,
    meal: "breakfast",
  })
  assert.deepEqual(read(client), [])
  assert.equal(read(client, nextWeek)[0]!.date, "2026-10-27")
  const rollbackUndo = await optimisticMoveUndo(client, [
    a as unknown as PlanSnapshot,
  ])
  assert.deepEqual(read(client), [a])
  assert.deepEqual(read(client, nextWeek), [])
  rollbackUndo()
  assert.deepEqual(read(client), [])
  assert.equal(read(client, nextWeek)[0]!.date, "2026-10-27")
})

test("an older failed move cannot overwrite a more recent move", async () => {
  const client = new QueryClient()
  const a = entry("a")
  client.setQueryData(week, { entries: [a] })
  const rollback = await optimisticMove(client, [a.id], {
    date: "2026-10-20",
    anyDay: false,
  })
  await optimisticMove(client, [a.id], { date: "2026-10-21", anyDay: false })
  rollback()
  assert.equal(read(client)[0]!.date, "2026-10-21")
})

test("rollback restores a move outside loaded ranges without changing other plan queries", async () => {
  const client = new QueryClient()
  const a = entry("a")
  client.setQueryData(week, { entries: [a] })
  client.setQueryData(["plan", "autoplan"], { enabled: true })
  const rollback = await optimisticMove(client, [a.id], {
    date: "2026-10-27",
    anyDay: false,
  })
  assert.deepEqual(read(client), [])
  rollback()
  assert.deepEqual(read(client), [a])
  assert.deepEqual(client.getQueryData(["plan", "autoplan"]), { enabled: true })
})

test("swaps two cached meals and rolls back only them", async () => {
  const client = new QueryClient()
  const a = entry("a")
  const b = entry("b", {
    anyDay: false,
    date: "2026-10-20",
    meal: "lunch",
    position: 1,
  })
  const lunch = entry("lunch", { meal: "lunch" })
  const c = entry("c", { anyDay: false, date: "2026-10-21" })
  client.setQueryData(week, { entries: [a, b, lunch, c] })
  const rollback = await optimisticSwap(client, a.id, b.id)
  const find = (id: string) => read(client).find((row) => row.id === id)!
  assert.deepEqual(pick(find("a")), {
    date: "2026-10-20",
    anyDay: false,
    meal: "lunch",
    position: 1,
  })
  // Into the pool it stays a lunch, after the pool's other lunch.
  assert.deepEqual(pick(find("b")), {
    date: "2026-10-19",
    anyDay: true,
    meal: "lunch",
    position: 1,
  })
  assert.deepEqual(find("c"), c)
  rollback()
  assert.deepEqual(find("a"), a)
  assert.deepEqual(find("b"), b)
})

test("swap with an uncached dish moves only the cached one and rolls back", async () => {
  const client = new QueryClient()
  const a = entry("a", { anyDay: false, date: "2026-10-20" })
  client.setQueryData(week, { entries: [a] })
  const rollback = await optimisticSwap(client, a.id, "far", {
    date: "2026-11-03",
    anyDay: false,
    meal: "lunch",
    position: 0,
  })
  // Gone from this week: it's in a week that isn't loaded.
  assert.deepEqual(read(client), [])
  rollback()
  assert.deepEqual(read(client), [a])
})

test("orders a meal's dishes, the unnamed after", async () => {
  const client = new QueryClient()
  const dinner = { anyDay: false, date: "2026-10-20" }
  const a = entry("a", { ...dinner, position: 0 })
  const b = entry("b", { ...dinner, position: 1 })
  const c = entry("c", { ...dinner, position: 2 })
  client.setQueryData(week, { entries: [a, b, c] })
  const rollback = await optimisticOrder(client, [c.id])
  assert.deepEqual(
    read(client).map((row) => [row.id, row.position]),
    [
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ]
  )
  rollback()
  assert.deepEqual(read(client), [a, b, c])
})
