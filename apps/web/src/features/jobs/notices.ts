// Telling whoever started a slow piece of work when it's done, after the
// request gave up waiting and left it to run in the background. Kept apart
// from React so it can be tested on its own.

import type { JobMoved } from "../imports/notices.ts"

/** The jobs a request can hand over: each ends with a notice. */
export const NOW_JOB_KINDS: ReadonlySet<string> = new Set([
  "recipes.workOutNutrition",
  "recipes.makePhoto",
  "stores.prices",
  "pantry.readReceipt",
])

/**
 * Whether a job event means telling this person: it's one of these, it
 * ended on its own (done or failed, not stopped), and they started it.
 */
export function jobNoticeFor(job: JobMoved, meId: string): boolean {
  if (!NOW_JOB_KINDS.has(job.kind)) return false
  if (job.status !== "done" && job.status !== "failed") return false
  return job.startedBy === meId
}

/**
 * A job as the server gives it, with what the notice needs. Not its
 * `error`: that's what broke inside it (SQL, a file path), for the server
 * admin's Jobs card. Why the person couldn't have it is in its result.
 */
export type EndedJob = {
  kind: string
  status: string
  handedOver: boolean
  result: { [key: string]: unknown } | null
}

/** What the notice says, as words to look up and their values. */
export type JobNoticeMessage = {
  key:
    | "jobs.notice.nutrition"
    | "jobs.notice.nutritionFailed"
    | "jobs.notice.photo"
    | "jobs.notice.photoFailed"
    | "jobs.notice.prices"
    | "jobs.notice.pricesFailed"
    | "jobs.notice.receipt"
    | "jobs.notice.receiptNoStore"
    | "jobs.notice.receiptNot"
    | "jobs.notice.receiptFailed"
    | "jobs.notice.receiptFailedNoReason"
    | "jobs.notice.failed"
  values: Record<string, string | number>
}

/**
 * Whether the notice is bad news, for the toast's look: each bad-news key
 * says it failed.
 */
export function isFailure(message: JobNoticeMessage): boolean {
  return /failed/i.test(message.key)
}

/** Why a job's result says it didn't work, when it does. */
function whyOf(result: EndedJob["result"]): string | null {
  const error = result?.error as { message?: unknown } | undefined
  return typeof error?.message === "string" ? error.message : null
}

function nameOf(result: EndedJob["result"]): string | null {
  return typeof result?.name === "string" ? result.name : null
}

/**
 * The notice's words, or null when the request waited and saw it finish:
 * they watched it, so there's nothing to tell.
 */
export function jobNoticeMessage(job: EndedJob): JobNoticeMessage | null {
  if (!job.handedOver) return null
  const { result } = job
  const why = whyOf(result)

  switch (job.kind) {
    case "recipes.workOutNutrition":
    case "recipes.makePhoto": {
      const name = nameOf(result)
      const nutrition = job.kind === "recipes.workOutNutrition"
      if (name && why) {
        return {
          key: nutrition
            ? "jobs.notice.nutritionFailed"
            : "jobs.notice.photoFailed",
          values: { name, why },
        }
      }
      if (name && job.status === "done") {
        return {
          key: nutrition ? "jobs.notice.nutrition" : "jobs.notice.photo",
          values: { name },
        }
      }
      break
    }
    case "stores.prices": {
      if (why) return { key: "jobs.notice.pricesFailed", values: { why } }
      if (job.status === "done" && typeof result?.deals === "number") {
        return { key: "jobs.notice.prices", values: { count: result.deals } }
      }
      break
    }
    case "pantry.readReceipt": {
      if (result?.status === "failed") {
        return why
          ? { key: "jobs.notice.receiptFailed", values: { why } }
          : { key: "jobs.notice.receiptFailedNoReason", values: {} }
      }
      if (result?.status === "recipe" || result?.status === "none") {
        return { key: "jobs.notice.receiptNot", values: {} }
      }
      if (result?.status === "ready") {
        const store = result.store
        return typeof store === "string" && store
          ? { key: "jobs.notice.receipt", values: { store } }
          : { key: "jobs.notice.receiptNoStore", values: {} }
      }
      break
    }
  }

  // The job itself failed (or ended without saying what it did). What broke
  // isn't said: it's for the server admin, not a notice.
  if (job.status === "failed") {
    return { key: "jobs.notice.failed", values: {} }
  }
  return null
}

/** Where View goes: the recipe, the stores settings, or the receipt. */
export function jobNoticeTarget(
  job: EndedJob
):
  | { to: "/recipes/$slug"; params: { slug: string } }
  | { to: "/settings/shopping" }
  | { to: "/pantry/receipts/$receiptId"; params: { receiptId: string } }
  | null {
  const result = job.result
  if (job.kind === "stores.prices") return { to: "/settings/shopping" }
  if (job.kind === "pantry.readReceipt") {
    const receiptId = result?.receiptId
    return typeof receiptId === "string"
      ? { to: "/pantry/receipts/$receiptId", params: { receiptId } }
      : null
  }
  const recipeId = result?.recipeId
  return typeof recipeId === "string"
    ? { to: "/recipes/$slug", params: { slug: recipeId } }
    : null
}
