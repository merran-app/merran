import type { EntityManager } from "@mikro-orm/sql"
import { z } from "zod"
import type { AppDeps } from "../../../core/context.ts"
import { AppError } from "../../../core/errors.ts"
import { Import, Job } from "../../../database/entities/index.ts"
import {
  beginImport,
  cancelWaitingImport,
  enqueueImport,
  finishImport,
  settleItem,
} from "../../imports/imports.ts"
import { failureOf, HANDOVER_MS, throwIfFailure } from "../../jobs/hand-over.ts"
import { JobStopped, type JobHandler } from "../../jobs/runner.ts"
import { loadRecipe } from "../recipes.ts"
import {
  importLink,
  importReadPage,
  type ImportResult,
  type ReadPage,
} from "./import-link.ts"
import { findBySourceUrl, isVideoLink, normalizeLink } from "./links.ts"
import { videoImportPossible } from "./video/import.ts"

// One link, from the app, the extension, the share sheet or an assistant's
// suggestion, imported as a job (docs/performance.md, decision 1). The
// request waits about ten seconds and opens the recipe if it's in;
// otherwise it hands over, and the import goes on in the background with
// its place on the Imports page. A video hands over at once: it never
// finishes in time.

const LINK_KIND = "recipes.importLink"
const VIDEO_KIND = "recipes.importVideo"

const Payload = z.object({
  url: z.string(),
  force: z.boolean().default(false),
  userId: z.string().nullable(),
  /** The page as the extension read it, for an import from the extension. */
  page: z.custom<ReadPage>().nullable().default(null),
})

/** What the job hands back to a request still waiting. */
const Outcome = z.union([
  z.object({ recipeId: z.string(), duplicate: z.boolean() }),
  z.object({
    error: z.object({
      kind: z.string(),
      code: z.string(),
      message: z.string(),
      fields: z.record(z.string(), z.string()).optional(),
    }),
  }),
])

export type ImportOneResult = { done: ImportResult } | { started: Import }

/**
 * Imports one link, or a page the extension read: done, as before, if it
 * comes in within the wait, or started, going on in the background.
 */
export async function importOne(
  em: EntityManager,
  deps: Pick<AppDeps, "jobs" | "settings" | "video" | "fetcher" | "ai">,
  input: {
    householdId: string
    userId: string | null
    url?: string
    page?: ReadPage
    force?: boolean
  },
  options: { handoverMs?: number } = {}
): Promise<ImportOneResult> {
  const url = normalizeLink(input.page?.url ?? input.url ?? "")
  // Already in the recipes: "You have this one", at once.
  if (!input.force) {
    const existing = await findBySourceUrl(em, [url])
    if (existing) {
      return {
        done: { recipe: await loadRecipe(em, existing.id), duplicate: true },
      }
    }
  }
  const video = isVideoLink(url)
  // A server or household that can't import videos says so now, not in
  // the background.
  if (video) await videoImportPossible(em, deps, input.householdId)
  const { job, record } = await enqueueImport(
    em,
    {
      kind: video ? VIDEO_KIND : LINK_KIND,
      householdId: input.householdId,
      payload: {
        url,
        force: input.force ?? false,
        userId: input.userId,
        page: video ? null : (input.page ?? null),
      },
      createdBy: input.userId,
      maxAttempts: 1,
    },
    {
      kind: video ? "video" : "link",
      source: url,
      // Listed only once it hands over: one that comes in while someone
      // waits just opens.
      listed: false,
      items: [{ label: url, ref: url }],
    }
  )
  // Adding it woke the runner already, except where nothing listens (tests).
  deps.jobs.wake()
  if (!video) {
    const status = await deps.jobs.waitFor(
      job.id,
      options.handoverMs ?? HANDOVER_MS
    )
    if (status) return finishedInTime(em, record.id, status)
  }
  record.listed = true
  await em.flush()
  return { started: record }
}

/** The recipe the job brought in while the request waited, or its error. */
async function finishedInTime(
  em: EntityManager,
  importId: string,
  status: string
): Promise<ImportOneResult> {
  const job = await em.findOne(Job, { id: importId }, { refresh: true })
  // It just opened, so its unlisted record goes.
  await em.nativeDelete(Import, { id: importId })
  const outcome = Outcome.safeParse(job?.result)
  if (status !== "done" || !outcome.success) {
    throw new AppError(
      "upstream",
      "import_failed",
      "Something went wrong with that link. Try again in a moment."
    )
  }
  throwIfFailure(outcome.data)
  if ("error" in outcome.data) throw new Error("Unreachable: thrown above.")
  const { recipeId, duplicate } = outcome.data
  return { done: { recipe: await loadRecipe(em, recipeId), duplicate } }
}

/** The job for one link or one video, which keeps its record's one item. */
function oneLinkJob(
  kind: string,
  limits: { concurrency: number; perHousehold: number; waitedOn?: boolean }
): JobHandler {
  return {
    kind,
    lane: "long",
    area: "recipes",
    ...limits,
    changes: ["recipes"],
    cancelledWaiting: (em, job) => cancelWaitingImport(em, job.id),
    async run({ jobId, em, householdId, payload, signal, deps }) {
      if (!householdId) throw new Error("An import needs a household.")
      const job = Payload.parse(payload)
      try {
        return await importTheLink(em, deps, jobId, householdId, job, signal)
      } finally {
        // A page the extension read can hold what its reader sees signed
        // in, so it's kept only while the job needs it: through a restart,
        // not for the 30 days the job is.
        if (job.page && !shuttingDown(signal)) {
          await deps.database.em
            .fork()
            .nativeUpdate(
              Job,
              { id: jobId },
              { payload: { ...job, page: null } }
            )
        }
      }
    },
  }
}

/** Merran is shutting down, so the job runs again next start. */
const shuttingDown = (signal: AbortSignal) =>
  signal.aborted &&
  signal.reason instanceof JobStopped &&
  signal.reason.why === "shutdown"

/** Brings in the job's link or page, keeping its record's one item. */
async function importTheLink(
  em: EntityManager,
  deps: Parameters<JobHandler["run"]>[0]["deps"],
  jobId: string,
  householdId: string,
  { url, force, userId, page }: z.infer<typeof Payload>,
  signal: AbortSignal
) {
  await beginImport(em, jobId, 1)
  try {
    const result = page
      ? await importReadPage(em, deps, { householdId, userId, page })
      : await importLink(em, deps, { householdId, userId, url, force })
    await settleItem(em, jobId, 0, {
      state: result.duplicate ? "already" : "added",
      recipeId: result.recipe.id,
    })
    await finishImport(em, jobId, { status: "done" })
    return { recipeId: result.recipe.id, duplicate: result.duplicate }
  } catch (err) {
    // Runs again at the next start.
    if (shuttingDown(signal)) throw err
    if (signal.aborted) {
      await finishImport(em, jobId, { status: "cancelled" })
      throw err
    }
    if (!(err instanceof AppError)) {
      await finishImport(em, jobId, {
        status: "failed",
        error: "Something went wrong with that link.",
      })
      throw err
    }
    // It didn't come in: the record says why, and so does the answer to
    // a request still waiting.
    await settleItem(em, jobId, 0, { state: "failed", error: err.message })
    await finishImport(em, jobId, { status: "failed", error: err.message })
    return failureOf(err)
  }
}

/**
 * One link: a page, which most often comes in within a few seconds, so
 * the request waits on it before handing over. A video hands over at once.
 */
export const importLinkJob = oneLinkJob(LINK_KIND, {
  concurrency: 3,
  perHousehold: 2,
  waitedOn: true,
})

/**
 * One video: minutes of downloading and listening, two at a time across
 * the server, which is all the old download queue allowed.
 */
export const importVideoJob = oneLinkJob(VIDEO_KIND, {
  concurrency: 2,
  perHousehold: 1,
})
