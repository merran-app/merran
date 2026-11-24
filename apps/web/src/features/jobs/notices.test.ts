import assert from "node:assert/strict"
import { test } from "node:test"

import {
  jobNoticeFor,
  jobNoticeTarget,
  jobNoticeMessage,
  NOW_JOB_KINDS,
  type EndedJob,
} from "./notices.ts"

const ME = "user-me"

const nutrition = {
  id: "job-1",
  kind: "recipes.workOutNutrition",
  status: "done",
  progress: null,
  startedBy: ME,
}

test("only the starter hears, and only of one that ended on its own", () => {
  assert.equal(jobNoticeFor({ ...nutrition, status: "done" }, ME), true)
  assert.equal(jobNoticeFor({ ...nutrition, status: "failed" }, ME), true)
  assert.equal(jobNoticeFor({ ...nutrition, status: "cancelled" }, ME), false)
  assert.equal(jobNoticeFor({ ...nutrition, status: "running" }, ME), false)
  assert.equal(jobNoticeFor({ ...nutrition, startedBy: "them" }, ME), false)
  assert.equal(jobNoticeFor({ ...nutrition, startedBy: null }, ME), false)
})

test("every job kind that has a notice", () => {
  for (const kind of [
    "recipes.workOutNutrition",
    "recipes.makePhoto",
    "stores.prices",
    "pantry.readReceipt",
  ]) {
    assert.equal(NOW_JOB_KINDS.has(kind), true, kind)
    assert.equal(jobNoticeFor({ ...nutrition, kind }, ME), true, kind)
  }
})

test("not for jobs that have no notice here", () => {
  assert.equal(
    jobNoticeFor({ ...nutrition, kind: "recipes.importLink" }, ME),
    false
  )
  assert.equal(jobNoticeFor({ ...nutrition, kind: "recipes.tidy" }, ME), false)
})

const ended = (more: Partial<EndedJob>): EndedJob => ({
  kind: "recipes.workOutNutrition",
  status: "done",
  handedOver: true,
  result: null,
  error: null,
  ...more,
})

const error = { kind: "upstream", code: "usda_down", message: "USDA is down." }

test("nutrition says it's worked out, or why it wasn't", () => {
  const result = { recipeId: "r", name: "Lemon Chicken" }
  assert.deepEqual(jobNoticeMessage(ended({ result })), {
    key: "jobs.notice.nutrition",
    values: { name: "Lemon Chicken" },
  })
  assert.deepEqual(jobNoticeMessage(ended({ result: { ...result, error } })), {
    key: "jobs.notice.nutritionFailed",
    values: { name: "Lemon Chicken", why: "USDA is down." },
  })
})

test("a photo says it's made, or why it wasn't", () => {
  const result = { recipeId: "r", name: "Lemon Chicken" }
  const kind = "recipes.makePhoto"
  assert.deepEqual(jobNoticeMessage(ended({ kind, result })), {
    key: "jobs.notice.photo",
    values: { name: "Lemon Chicken" },
  })
  assert.deepEqual(
    jobNoticeMessage(ended({ kind, result: { ...result, error } })),
    {
      key: "jobs.notice.photoFailed",
      values: { name: "Lemon Chicken", why: "USDA is down." },
    }
  )
})

test("prices say how many deals, or why not", () => {
  const kind = "stores.prices"
  assert.deepEqual(jobNoticeMessage(ended({ kind, result: { deals: 4 } })), {
    key: "jobs.notice.prices",
    values: { count: 4 },
  })
  assert.deepEqual(jobNoticeMessage(ended({ kind, result: { error } })), {
    key: "jobs.notice.pricesFailed",
    values: { why: "USDA is down." },
  })
})

test("a receipt says it's ready, with its store when it has one", () => {
  const kind = "pantry.readReceipt"
  assert.deepEqual(
    jobNoticeMessage(
      ended({
        kind,
        result: { receiptId: "x", store: "Kroger", lines: 9, status: "ready" },
      })
    ),
    { key: "jobs.notice.receipt", values: { store: "Kroger" } }
  )
  assert.deepEqual(
    jobNoticeMessage(
      ended({
        kind,
        result: { receiptId: "x", store: null, lines: 9, status: "ready" },
      })
    ),
    { key: "jobs.notice.receiptNoStore", values: {} }
  )
})

test("a receipt that wasn't one, or couldn't be read", () => {
  const kind = "pantry.readReceipt"
  for (const status of ["recipe", "none"]) {
    assert.deepEqual(
      jobNoticeMessage(ended({ kind, result: { receiptId: "x", status } })),
      { key: "jobs.notice.receiptNot", values: {} }
    )
  }
  assert.deepEqual(
    jobNoticeMessage(
      ended({
        kind,
        result: { receiptId: "x", status: "failed", error },
      })
    ),
    { key: "jobs.notice.receiptFailed", values: { why: "USDA is down." } }
  )
})

test("a job that failed outright says so with its error", () => {
  assert.deepEqual(
    jobNoticeMessage(ended({ status: "failed", error: "It broke." })),
    { key: "jobs.notice.failed", values: { why: "It broke." } }
  )
})

test("nothing to say when they watched it finish", () => {
  const result = { recipeId: "r", name: "Lemon Chicken" }
  assert.equal(jobNoticeMessage(ended({ handedOver: false, result })), null)
})

test("View opens where the work shows", () => {
  const ended = (kind: string, result: EndedJob["result"]): EndedJob => ({
    kind,
    status: "done",
    handedOver: true,
    result,
    error: null,
  })
  assert.deepEqual(jobNoticeTarget(ended("stores.prices", { deals: 2 })), {
    to: "/settings/shopping",
  })
  assert.deepEqual(
    jobNoticeTarget(ended("recipes.makePhoto", { recipeId: "r1" })),
    { to: "/recipes/$slug", params: { slug: "r1" } }
  )
  assert.deepEqual(
    jobNoticeTarget(ended("pantry.readReceipt", { receiptId: "x1" })),
    { to: "/pantry/receipts/$receiptId", params: { receiptId: "x1" } }
  )
  assert.equal(jobNoticeTarget(ended("pantry.readReceipt", {})), null)
})
