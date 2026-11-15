import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import {
  Import,
  ImportItem,
  Job,
  type ImportKind,
} from "../../database/entities/index.ts"
import { ACTIVE, createJob, wakeRunner, type NewJob } from "../jobs/jobs.ts"
import { JobStopped } from "../jobs/runner.ts"

// Each import's record, for the Imports page: what it was, who started it,
// how it went, and what came of each link or recipe. The import's job keeps
// it up to date as it goes (docs/performance.md, "The Imports page").

/** How long a record is kept. Deleting it never deletes a recipe. */
export const KEEP_IMPORTS_DAYS = 90

/**
 * How long a record nobody sees is kept: a single link that finished while
 * someone waited, whose request didn't get to clear it.
 */
export const KEEP_UNLISTED_HOURS = 24

export type NewImport = {
  /** Its job's id. */
  id: string
  householdId: string
  kind: ImportKind
  source: string | null
  createdBy: string | null
  listed: boolean
  /** Added to every recipe it makes. */
  tag?: string | null
  /** What Try again needs besides the items (never a token). */
  retry?: Record<string, unknown> | null
  /** Its links, each waiting, for an import that knows them from the start. */
  items?: readonly { label: string; ref: string | null }[]
}

/** What came of an item. */
export type ItemOutcome = {
  state: "added" | "already" | "failed"
  recipeId?: string | null
  error?: string | null
}

const COUNTS = { added: "added", already: "already", failed: "failed" } as const

/**
 * Makes an import's record, with its items when it knows them. Not saved
 * yet: it goes in the same flush as the job that runs it.
 */
export function createImport(em: EntityManager, input: NewImport) {
  const record = em.create(Import, {
    id: input.id,
    household: input.householdId,
    kind: input.kind,
    source: input.source,
    createdBy: input.createdBy,
    listed: input.listed,
    tag: input.tag ?? null,
    retry: input.retry ?? null,
    total: input.items?.length ?? 0,
  })
  for (const [position, item] of (input.items ?? []).entries()) {
    em.create(ImportItem, {
      household: input.householdId,
      import: record,
      position,
      label: item.label,
      ref: item.ref,
    })
  }
  return record
}

/** Counts an item's outcome on its import. */
async function count(
  em: EntityManager,
  importId: string,
  outcome: ItemOutcome
) {
  const record = await em.findOneOrFail(Import, { id: importId })
  record[COUNTS[outcome.state]]++
}

/** Says what came of one of an import's waiting items, like a link. */
export async function settleItem(
  em: EntityManager,
  importId: string,
  position: number,
  outcome: ItemOutcome
) {
  const item = await em.findOneOrFail(ImportItem, {
    import: importId,
    position,
  })
  item.state = outcome.state
  item.recipe = (outcome.recipeId ?? null) as never
  item.error = outcome.error ?? null
  await count(em, importId, outcome)
  await em.flush()
}

/**
 * Adds an item as an import gets to it, like a recipe from another app, in
 * the next place.
 */
export async function addItem(
  em: EntityManager,
  importId: string,
  item: { label: string; ref: string | null } & ItemOutcome
) {
  const record = await em.findOneOrFail(Import, { id: importId })
  const position = await em.count(ImportItem, { import: importId })
  em.create(ImportItem, {
    household: record.household,
    import: record,
    position,
    label: item.label,
    ref: item.ref,
    state: item.state,
    recipe: item.recipeId ?? null,
    error: item.error ?? null,
  })
  // Counted as it goes when it didn't know how many it had.
  if (record.total < position + 1) record.total = position + 1
  await count(em, importId, item)
  await em.flush()
}

/** The import's job has started, and how many it has, once it knows. */
export async function beginImport(
  em: EntityManager,
  importId: string,
  total?: number
) {
  const record = await em.findOneOrFail(Import, { id: importId })
  record.status = "running"
  if (total !== undefined) record.total = total
  await em.flush()
}

/** How the import ended. */
export async function finishImport(
  em: EntityManager,
  importId: string,
  outcome: { status: "done" | "failed" | "cancelled"; error?: string | null }
) {
  const record = await em.findOneOrFail(Import, { id: importId })
  record.status = outcome.status
  record.error = outcome.error ?? null
  record.finishedAt = new Date()
  await em.flush()
}

/**
 * The record of an import's job, made from the job when it has none: one
 * started before records were kept, still running when Merran restarted.
 */
export async function ensureImport(
  em: EntityManager,
  job: { id: string; householdId: string; createdBy: string | null },
  input: Omit<NewImport, "id" | "householdId" | "createdBy">
) {
  const found = await em.findOne(Import, { id: job.id })
  if (found) return found
  const record = createImport(em, { ...input, ...job })
  await em.flush()
  return record
}

/**
 * Adds an import's job and its record together, the record under the job's
 * id. With a key, one already waiting or running is returned instead, as
 * `enqueue` does.
 */
export async function enqueueImport(
  em: EntityManager,
  job: NewJob & { householdId: string },
  input: Omit<NewImport, "id" | "householdId" | "createdBy">
) {
  if (job.key) {
    const existing = await em.findOne(Job, {
      key: job.key,
      status: { $in: [...ACTIVE] },
    })
    if (existing) {
      const record = await ensureImport(
        em,
        {
          id: existing.id,
          householdId: job.householdId,
          createdBy: existing.createdBy?.id ?? null,
        },
        input
      )
      return { job: existing, record }
    }
  }
  const created = createJob(em, job)
  const record = createImport(em, {
    ...input,
    id: created.id,
    householdId: job.householdId,
    createdBy: job.createdBy ?? null,
  })
  await em.flush()
  wakeRunner()
  return { job: created, record }
}

/**
 * Runs an import's work, keeping its record's status in step: running, then
 * done, failed or cancelled. Cut off by a shutdown, it stays running, since
 * the job runs again at the next start.
 */
export async function asImport<T>(
  em: EntityManager,
  importId: string,
  signal: AbortSignal,
  work: () => Promise<T>,
  total?: number
): Promise<T> {
  await beginImport(em, importId, total)
  try {
    const result = await work()
    await finishImport(em, importId, { status: "done" })
    return result
  } catch (err) {
    const why = signal.reason instanceof JobStopped ? signal.reason.why : null
    if (signal.aborted && why === "shutdown") throw err
    await finishImport(
      em,
      importId,
      signal.aborted
        ? { status: "cancelled" }
        : {
            status: "failed",
            error:
              err instanceof AppError
                ? err.message
                : "Something went wrong. Try again in a moment.",
          }
    )
    throw err
  }
}

/** A waiting import's job was cancelled before it started: so is the import. */
export async function cancelWaitingImport(em: EntityManager, importId: string) {
  const record = await em.findOne(Import, { id: importId })
  if (!record || record.status !== "queued") return
  await finishImport(em, importId, { status: "cancelled" })
}

/** Clears records past their 90 days, and unlisted ones after a day. */
export async function clearOldImports(em: EntityManager, now = new Date()) {
  const old = new Date(now.getTime() - KEEP_IMPORTS_DAYS * 24 * 60 * 60_000)
  const unlisted = new Date(now.getTime() - KEEP_UNLISTED_HOURS * 60 * 60_000)
  return em.nativeDelete(
    Import,
    {
      $or: [
        { createdAt: { $lt: old } },
        { listed: false, createdAt: { $lt: unlisted } },
      ],
    },
    { filters: false }
  )
}
