import assert from "node:assert/strict"
import { afterEach, beforeEach, test } from "node:test"

import { QueryClient } from "@tanstack/react-query"

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

test("a list set by hand makes Today's summary stale", () => {
  assert.equal(stale(), false)
  queryClient.setQueryData(["list"], { items: [] })
  assert.equal(stale(), true)
})

test("invalidating the pantry makes it stale", async () => {
  queryClient.setQueryData(["pantry"], { items: [] })
  await queryClient.invalidateQueries({ queryKey: ["pantry"] })
  assert.equal(stale(), true)
})

test("loading the plan doesn't", async () => {
  await queryClient.fetchQuery({
    queryKey: ["plan", "2026-11-23", "2026-12-05"],
    queryFn: () => Promise.resolve({ entries: [] }),
  })
  assert.equal(stale(), false)
})

test("a settings query changing doesn't", () => {
  queryClient.setQueryData(["settings", "server"], { name: "Merran" })
  assert.equal(stale(), false)
})
