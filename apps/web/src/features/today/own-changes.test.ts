import assert from "node:assert/strict"
import { afterEach, beforeEach, test } from "node:test"

import { QueryClient, QueryObserver } from "@tanstack/react-query"

import { followOwnChanges } from "./own-changes.ts"

let queryClient: QueryClient
let stop: () => void

beforeEach(() => {
  queryClient = new QueryClient()
  queryClient.setQueryData(["today"], { list: null })
  stop = followOwnChanges(queryClient)
})

afterEach(() => stop())

const stale = () => queryClient.getQueryState(["today"])?.isInvalidated

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Watches Today's summary as the page does, counting its requests. */
async function watchToday(delayMs = 0) {
  let calls = 0
  const observer = new QueryObserver(queryClient, {
    queryKey: ["today"],
    staleTime: 60_000,
    queryFn: async () => {
      calls++
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      return { list: null }
    },
  })
  const unwatch = observer.subscribe(() => {})
  await tick()
  await tick()
  return { observer, unwatch, calls: () => calls }
}

test("a list set by hand makes Today's summary stale", async () => {
  assert.equal(stale(), false)
  queryClient.setQueryData(["list"], { items: [] })
  await tick()
  assert.equal(stale(), true)
})

test("invalidating the pantry makes it stale", async () => {
  queryClient.setQueryData(["pantry"], { items: [] })
  await queryClient.invalidateQueries({ queryKey: ["pantry"] })
  await tick()
  assert.equal(stale(), true)
})

test("loading the plan doesn't", async () => {
  await queryClient.fetchQuery({
    queryKey: ["plan", "2026-11-23", "2026-12-05"],
    queryFn: () => Promise.resolve({ entries: [] }),
  })
  assert.equal(stale(), false)
})

test("three plan queries invalidated at once fetch Today's summary once", async () => {
  const today = await watchToday()
  for (const week of ["a", "b", "c"]) {
    queryClient.setQueryData(["plan", week], { entries: [] })
  }
  await tick()
  await tick()
  const before = today.calls()
  await queryClient.invalidateQueries({ queryKey: ["plan"] })
  await tick()
  await tick()
  assert.equal(today.calls() - before, 1)
  today.unwatch()
})

test("a summary fetch already going isn't repeated", async () => {
  const today = await watchToday(50)
  queryClient.setQueryData(["list"], { items: [] })
  const before = today.calls()
  void today.observer.refetch()
  await tick()
  await queryClient.invalidateQueries({ queryKey: ["list"] })
  await new Promise((resolve) => setTimeout(resolve, 120))
  assert.equal(today.calls() - before, 1)
  today.unwatch()
})

test("a settings query changing doesn't", async () => {
  queryClient.setQueryData(["settings", "server"], { name: "Merran" })
  await tick()
  assert.equal(stale(), false)
})
