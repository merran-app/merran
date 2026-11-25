import type { EntityManager } from "@mikro-orm/sql"
import { z } from "zod"
import { AppError } from "../../../../core/errors.ts"
import { Job } from "../../../../database/entities/index.ts"
import type { ImportFileSchema } from "../../../../http/schemas/imports.ts"
import { enqueue } from "../../../jobs/jobs.ts"
import type { JobHandler } from "../../../jobs/runner.ts"
import { inspectUpload } from "./files.ts"
import { alreadyHere } from "./job.ts"

// Checking a file someone uploaded to import from another app: what's in
// it and how much is here already. A big Paprika or Mealie file takes a
// while to read, so it's read in the background, not in the request.

const KIND = "recipes.checkFile"

const Payload = z.object({ file: z.string(), fileId: z.string() })

/** What a check found, as its job keeps it. */
const Outcome = z.union([
  z.object({ file: z.record(z.string(), z.unknown()) }),
  z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
])

const checkKey = (fileId: string) => `check:${fileId}`

/** What's in a file, as the API says it. */
type ImportFile = z.infer<typeof ImportFileSchema>

/** Starts checking an uploaded file, in the background. */
export function startFileCheck(
  em: EntityManager,
  options: { householdId: string; userId: string; fileId: string; file: string }
) {
  return enqueue(em, {
    kind: KIND,
    key: checkKey(options.fileId),
    householdId: options.householdId,
    payload: { file: options.file, fileId: options.fileId },
    createdBy: options.userId,
    maxAttempts: 1,
  })
}

/** How a file's check is going: checking, ready with what's in it, or not. */
export async function describeFileCheck(
  em: EntityManager,
  fileId: string,
  householdId: string
) {
  const job = await em.findOne(
    Job,
    { key: checkKey(fileId), forHousehold: householdId },
    { orderBy: { createdAt: "desc" }, refresh: true }
  )
  if (!job) {
    throw new AppError(
      "not_found",
      "upload_gone",
      "That file isn't here any more. Choose it again."
    )
  }
  if (job.status === "queued" || job.status === "running") {
    return { id: fileId, status: "checking" as const, file: null, error: null }
  }
  const outcome = Outcome.safeParse(job.result)
  if (job.status === "done" && outcome.success && "file" in outcome.data) {
    return {
      id: fileId,
      status: "ready" as const,
      // As the job wrote it, from inspectUpload.
      file: { ...outcome.data.file, id: fileId } as ImportFile,
      error: null,
    }
  }
  return {
    id: fileId,
    status: "failed" as const,
    file: null,
    error:
      outcome.success && "error" in outcome.data
        ? outcome.data.error
        : {
            code: "check_failed",
            message: "Merran couldn't read that file. Try it again.",
          },
  }
}

/** Reads the file: what's in it, or why Merran can't import it. */
export const checkFileJob: JobHandler = {
  kind: KIND,
  lane: "long",
  // The upload waits a moment for it before handing over.
  waitedOn: true,
  area: "household",
  concurrency: 2,
  perHousehold: 1,
  async run({ em, payload }) {
    const { file, fileId } = Payload.parse(payload)
    try {
      const { refs, ...summary } = await inspectUpload(file)
      return {
        file: {
          id: fileId,
          ...summary,
          alreadyHere: await alreadyHere(em, refs),
        },
      }
    } catch (err) {
      // Not a file Merran can import: the card says why.
      if (!(err instanceof AppError)) throw err
      return { error: { code: err.code, message: err.message } }
    }
  },
}
