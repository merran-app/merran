import assert from "node:assert/strict"
import { test } from "node:test"
import { QueryClient } from "@tanstack/react-query"

import type { PlanEntry, PlanSnapshot } from "../queries"
import { optimisticMove, optimisticMoveUndo } from "./optimistic-move.ts"

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
