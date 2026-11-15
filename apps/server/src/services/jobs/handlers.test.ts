import { describe, expect, test } from "vitest"
import { END_QUIET_JOB } from "../cooking/quiet-check.ts"
import { CLOSE_SESSION_JOB } from "../cooking/sessions.ts"
import { TIMER_DONE_JOB } from "../cooking/timers.ts"
import { WEBHOOK_GATHER_JOB } from "../webhooks/gathering/gathering.ts"
import { HEADS_UP_JOB } from "../webhooks/heads-ups/schedule.ts"
import { WEBHOOK_DELIVERY_JOB } from "../webhooks/record.ts"
import { JOB_HANDLERS } from "./handlers.ts"

// The quick lane is for jobs that call no AI, open no pages and finish in
// seconds (docs/performance.md, decision 4); the rest wait in the long one.
const QUICK_KINDS = [
  "email.invitation",
  "email.passwordReset",
  "telemetry.send",
  "updates.check",
  "jobs.cleanUp",
  WEBHOOK_DELIVERY_JOB,
  WEBHOOK_GATHER_JOB,
  HEADS_UP_JOB,
  CLOSE_SESSION_JOB,
  TIMER_DONE_JOB,
  END_QUIET_JOB,
]

describe("the kinds of job", () => {
  test("every kind says which lane it's in", () => {
    const missing = JOB_HANDLERS.filter((handler) => handler.lane === undefined)
    expect(missing.map((handler) => handler.kind)).toEqual([])
  })

  test("kinds a recipe's own jobs share with library runs have no limit per household", () => {
    // A recipe just saved gets its nutrition, photo and tidy-up while the
    // household's library run of the same kind goes on, perhaps for an hour.
    const shared = ["recipes.nutrition", "recipes.photos", "recipes.tidy"]
    const limited = JOB_HANDLERS.filter(
      (handler) =>
        shared.includes(handler.kind) && handler.perHousehold !== undefined
    )
    expect(limited.map((handler) => handler.kind)).toEqual([])
  })

  test("emails, deliveries and housekeeping are quick; AI and pages are long", () => {
    const quick = JOB_HANDLERS.filter((handler) => handler.lane === "quick")
    expect(quick.map((handler) => handler.kind).sort()).toEqual(
      [...QUICK_KINDS].sort()
    )
  })
})
