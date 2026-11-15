import assert from "node:assert/strict"
import { test } from "node:test"

import { noticeFor, noticeMessage } from "./notices.ts"

const ME = "user-me"

const job = {
  id: "import-1",
  kind: "recipes.importLinks",
  status: "done",
  progress: { done: 3, total: 3 },
  startedBy: ME,
}

test("tells me when an import I started has ended", () => {
  assert.equal(noticeFor(job, ME), true)
  assert.equal(noticeFor({ ...job, status: "failed" }, ME), true)
  assert.equal(noticeFor({ ...job, kind: "household.import" }, ME), true)
  assert.equal(noticeFor({ ...job, kind: "recipes.importLink" }, ME), true)
})

test("not while it goes, once I stopped it, or when it isn't mine", () => {
  assert.equal(noticeFor({ ...job, status: "running" }, ME), false)
  assert.equal(noticeFor({ ...job, status: "queued" }, ME), false)
  assert.equal(noticeFor({ ...job, status: "cancelled" }, ME), false)
  assert.equal(noticeFor({ ...job, startedBy: "user-jamie" }, ME), false)
  assert.equal(noticeFor({ ...job, startedBy: null }, ME), false)
})

test("not for jobs that aren't imports", () => {
  assert.equal(noticeFor({ ...job, kind: "recipes.tidy" }, ME), false)
  assert.equal(noticeFor({ ...job, kind: "recipes.checkFile" }, ME), false)
})

const found = {
  kind: "links",
  status: "done",
  added: 12,
  already: 2,
  failed: 1,
}

test("says how many came in", () => {
  assert.deepEqual(noticeMessage(found, null), {
    key: "imports.notice.done",
    values: { count: 12 },
  })
})

test("names one link's recipe", () => {
  assert.deepEqual(
    noticeMessage(
      { ...found, kind: "link", added: 1, already: 0, failed: 0 },
      "Lemon Chicken"
    ),
    { key: "imports.notice.one", values: { name: "Lemon Chicken" } }
  )
  assert.deepEqual(
    noticeMessage(
      { ...found, kind: "video", added: 1, already: 0, failed: 0 },
      "Bean Stew"
    ),
    { key: "imports.notice.one", values: { name: "Bean Stew" } }
  )
})

test("says when nothing new came in, and when it didn't work", () => {
  assert.deepEqual(
    noticeMessage({ ...found, added: 0, already: 3, failed: 0 }, null),
    { key: "imports.notice.nothingNew", values: {} }
  )
  assert.deepEqual(
    noticeMessage({ ...found, added: 0, already: 0, failed: 2 }, null),
    { key: "imports.notice.failed", values: {} }
  )
  assert.deepEqual(noticeMessage({ ...found, status: "failed" }, null), {
    key: "imports.notice.failed",
    values: {},
  })
})
