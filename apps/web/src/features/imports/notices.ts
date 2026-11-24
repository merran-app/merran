// Telling whoever started an import when it's in, from the live stream's
// job events. Kept apart from React so it can be tested on its own.

/** The jobs that are imports, each with its record on the Imports page. */
export const IMPORT_JOB_KINDS: ReadonlySet<string> = new Set([
  "recipes.importLink",
  "recipes.importVideo",
  "recipes.importLinks",
  "recipes.importFromApp",
  "household.import",
])

/** A job event from the live stream. */
export type JobMoved = {
  id: string
  kind: string
  status: string
  progress: { done: number; total: number } | null
  startedBy: string | null
}

/**
 * Whether a job event means telling this person their import is in: it's
 * an import, it ended on its own (done or failed, not stopped), and they
 * started it.
 */
export function noticeFor(job: JobMoved, meId: string): boolean {
  if (!IMPORT_JOB_KINDS.has(job.kind)) return false
  if (job.status !== "done" && job.status !== "failed") return false
  return job.startedBy === meId
}

type Ended = {
  kind: string
  status: string
  added: number
  already: number
  failed: number
}

/** What the notice says, as words to look up and their values. */
export type NoticeMessage = {
  key:
    | "imports.notice.done"
    | "imports.notice.one"
    | "imports.notice.nothingNew"
    | "imports.notice.failed"
  values: Record<string, string | number>
}

/**
 * The notice's words: how many came in, one link's recipe by name, or that
 * nothing new came in or it didn't work.
 */
export function noticeMessage(
  found: Ended,
  firstName: string | null
): NoticeMessage {
  const nothingCameIn = found.added === 0
  if (found.status === "failed" || (nothingCameIn && found.failed > 0)) {
    return { key: "imports.notice.failed", values: {} }
  }
  if (nothingCameIn) return { key: "imports.notice.nothingNew", values: {} }
  const oneLink = found.kind === "link" || found.kind === "video"
  if (oneLink && found.added === 1 && firstName) {
    return { key: "imports.notice.one", values: { name: firstName } }
  }
  return { key: "imports.notice.done", values: { count: found.added } }
}
