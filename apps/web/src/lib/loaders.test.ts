import assert from "node:assert/strict"
import { test } from "node:test"

import { QueryClient } from "@tanstack/react-query"

import { preloadInfiniteQuery, preloadQuery } from "./loaders.ts"

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

test("a preload that fails doesn't throw", async () => {
  const queryClient = newClient()
  const queryKey = ["broken"]
  await preloadQuery(queryClient, {
    queryKey,
    queryFn: () => Promise.reject(new Error("refused")),
  })
  assert.equal(queryClient.getQueryState(queryKey)?.status, "error")
})

test("a preload keeps what it loaded", async () => {
  const queryClient = newClient()
  const queryKey = ["fine"]
  await preloadQuery(queryClient, {
    queryKey,
    queryFn: () => Promise.resolve("loaded"),
  })
  assert.equal(queryClient.getQueryData(queryKey), "loaded")
})

test("an infinite preload keeps its first page", async () => {
  const queryClient = newClient()
  const queryKey = ["pages"]
  await preloadInfiniteQuery(queryClient, {
    queryKey,
    queryFn: () => Promise.resolve(["first"]),
    initialPageParam: 0,
    getNextPageParam: () => undefined,
  })
  assert.deepEqual(queryClient.getQueryData(queryKey), {
    pages: [["first"]],
    pageParams: [0],
  })
})

test("an infinite preload that fails doesn't throw", async () => {
  const queryClient = newClient()
  await preloadInfiniteQuery(queryClient, {
    queryKey: ["broken-pages"],
    queryFn: () => Promise.reject(new Error("refused")),
    initialPageParam: 0,
    getNextPageParam: () => undefined,
  })
  assert.equal(queryClient.getQueryState(["broken-pages"])?.status, "error")
})
