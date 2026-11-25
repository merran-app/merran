import type { EntityManager } from "@mikro-orm/sql"
import { AppError, type AppErrorKind } from "../../core/errors.ts"
import { Job } from "../../database/entities/index.ts"
import type { JobRunner } from "./runner.ts"

// Every "do it now" request that became a job answers like one link does
// (docs/performance.md, decision 1): it waits about ten seconds and answers
// with the job's result if it's in, and otherwise hands over. A job handed
// over keeps going in the background, and is marked so, so whoever started
// it hears when it ends.

/** How long a request waits before handing over. */
export const HANDOVER_MS = 10_000

/**
 * What a job returns for an error the person should see, so a request still
 * waiting can answer with it: the job itself didn't break, it was refused.
 */
export type Failure = {
  error: {
    kind: AppErrorKind
    code: string
    message: string
    fields?: Record<string, string>
  }
}

export function failureOf(err: AppError): Failure {
  return {
    error: {
      kind: err.kind,
      code: err.code,
      message: err.message,
      ...(err.fields ? { fields: err.fields } : {}),
    },
  }
}

/** Throws the error a job's result describes, if it describes one. */
export function throwIfFailure(result: unknown): void {
  if (typeof result !== "object" || result === null || !("error" in result)) {
    return
  }
  const { error } = result as { error?: Partial<Failure["error"]> }
  if (!error || typeof error !== "object") return
  if (typeof error.code !== "string" || typeof error.message !== "string") {
    return
  }
  throw new AppError(
    error.kind ?? "upstream",
    error.code,
    error.message,
    error.fields
  )
}

/**
 * Waits for a job, then answers: with what it returned if it ended in time
 * (an error it returned is thrown, with its own status), or with the job,
 * marked as handed over, if it's still going.
 */
export async function waitThenHandOver(
  em: EntityManager,
  jobs: JobRunner,
  jobId: string,
  options: {
    ms?: number
    /**
     * Called once the job is marked handed over, before it's looked at
     * again. Tests use it to end the job at exactly that moment: the one
     * place a job can end unseen, which no timing could hit reliably.
     */
    afterHandOver?: () => Promise<void>
  } = {}
): Promise<{ done: Record<string, unknown> | null } | { started: Job }> {
  const status = await jobs.waitFor(jobId, options.ms ?? HANDOVER_MS)
  if (status) return answerFor(await loadJob(em, jobId))

  const job = await loadJob(em, jobId)
  job.handedOverAt = new Date()
  await em.flush()
  await options.afterHandOver?.()

  // It may have ended between the wait and the mark, with nobody left to
  // tell: so it's looked at again, and answered as if it came in time.
  const again = await loadJob(em, jobId)
  if (isOver(again)) {
    again.handedOverAt = null
    await em.flush()
    return answerFor(again)
  }
  return { started: again }
}

/** The job as it is now, not as this entity manager last saw it. */
function loadJob(em: EntityManager, jobId: string) {
  return em.findOneOrFail(Job, { id: jobId }, { refresh: true })
}

const isOver = (job: Job) =>
  job.status === "done" || job.status === "failed" || job.status === "cancelled"

/** What a request answers for a job that has ended. */
function answerFor(job: Job): { done: Record<string, unknown> | null } {
  // The job's own error is what broke inside it (SQL, a file path), kept
  // for the server admin's Jobs card and error tracking, not for whoever
  // was waiting. An error that's theirs to see comes back as its result.
  if (job.status === "failed") {
    throw new AppError(
      "upstream",
      "job_failed",
      "That didn't work. Try again in a moment."
    )
  }
  if (job.status === "cancelled") {
    throw new AppError(
      "conflict",
      "job_stopped",
      "It was stopped before it finished."
    )
  }
  throwIfFailure(job.result)
  return { done: job.result ?? null }
}
