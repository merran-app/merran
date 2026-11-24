import { z } from "zod"
import type { EntityManager } from "@mikro-orm/sql"
import { createJob } from "../jobs/jobs.ts"
import type { JobHandler } from "../jobs/runner.ts"
import { throwIfStopped } from "../jobs/stop.ts"

/**
 * Removing files takes a network call each on S3, so what a request deletes
 * for good leaves its files to a job: the rows go at once, and the files
 * follow in the background.
 */
export const REMOVE_FILES_JOB = "files.remove"

const Payload = z.object({
  /** What `files.remove` takes: a file, or a key's whole folder. */
  paths: z.array(z.string()),
})

/** Removes the files, stopping between them when the job is stopped. */
export const removeFilesJob: JobHandler = {
  kind: REMOVE_FILES_JOB,
  lane: "long",
  // One at a time, so a big Empty doesn't crowd out the other long jobs.
  concurrency: 1,
  async run({ payload, deps }) {
    const { paths } = Payload.parse(payload)
    for (const path of paths) {
      throwIfStopped()
      // A path that's already gone is fine, so a try that's repeated is too.
      await deps.files.remove(path)
    }
    return { removed: paths.length }
  },
}

/**
 * A job to remove these files, saved with the caller's own flush: the files
 * go only if the change that left them behind is saved. The caller then
 * calls `wakeRunner`. Null when there's nothing to remove.
 */
export function removeFilesLater(
  em: EntityManager,
  householdId: string,
  paths: readonly string[]
) {
  if (paths.length === 0) return null
  return createJob(em, {
    kind: REMOVE_FILES_JOB,
    householdId,
    payload: { paths: [...paths] },
    maxAttempts: 3,
  })
}
