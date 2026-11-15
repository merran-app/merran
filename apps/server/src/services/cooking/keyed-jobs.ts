import type { EntityManager } from "@mikro-orm/sql"
import { Job } from "../../database/entities/index.ts"
import { createJob, wakeRunner } from "../jobs/jobs.ts"

// Cooking's jobs each have a key of their own (a timer's end, a session's
// close or quiet check), and each is moved rather than added to when its
// time changes.

type KeyedJob = {
  kind: string
  key: string
  householdId: string
  payload: Record<string, unknown>
  runAt: Date
}

/**
 * Puts the job at `runAt`: moving the one waiting, or making one when none
 * is. One running now finds its time isn't up and does nothing, so the new
 * one gets a row of its own.
 */
export async function putKeyedJob(
  em: EntityManager,
  job: KeyedJob
): Promise<void> {
  const waiting = await em.findOne(Job, { key: job.key, status: "queued" })
  if (waiting) {
    waiting.runAt = job.runAt
    await em.flush()
    return
  }
  createJob(em, job)
  await em.flush()
  wakeRunner()
}

/** Cancels the job waiting with this key. One running finishes. */
export async function cancelKeyedJob(
  em: EntityManager,
  key: string
): Promise<void> {
  await em.nativeUpdate(
    Job,
    { key, status: "queued" },
    { status: "cancelled", finishedAt: new Date() }
  )
}
