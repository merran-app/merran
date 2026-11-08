import assert from "node:assert/strict"
import { test } from "node:test"

import type { PlanEntry } from "../queries"
import { swapTargets } from "./swap-targets.ts"

const dish = (id: string, changes: Partial<PlanEntry> = {}) =>
  ({
    id,
    date: "2026-11-10",
    anyDay: false,
    meal: "dinner",
    position: 0,
    ...changes,
  }) as PlanEntry

const soup = dish("soup")
const bread = dish("bread", { position: 1 })
const salad = dish("salad", { date: "2026-11-12", meal: "lunch" })
const pizza = dish("pizza", { date: "2026-11-09", anyDay: true })
const plan = [soup, bread, salad, pizza]

test("offers the dishes in another dated meal", () => {
  assert.deepEqual(
    swapTargets(plan, soup, { date: "2026-11-12", meal: "lunch" }),
    [salad]
  )
})

test("offers nothing in the dish's own meal: that's reordering", () => {
  assert.deepEqual(
    swapTargets(plan, soup, { date: "2026-11-10", meal: "dinner" }),
    []
  )
})

test("a pool dish can swap with a dated meal's dishes", () => {
  assert.deepEqual(
    swapTargets(plan, pizza, { date: "2026-11-10", meal: "dinner" }),
    [soup, bread]
  )
})
