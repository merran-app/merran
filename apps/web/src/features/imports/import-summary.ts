/** What an import's line says, as words to look up and their numbers. */
export type SummaryLine = { key: string; values: Record<string, number> }[]

type Counts = {
  status: string
  total: number
  done: number
  added: number
  already: number
  failed: number
  stopped: number
  undone: number
}

/**
 * An import's line on the Imports page: "Importing 12 of 52" while it
 * goes, or "48 came in, 3 already here, 1 didn't" once it's over.
 */
export function importSummary(found: Counts): SummaryLine {
  if (found.status === "queued")
    return [{ key: "imports.summary.waiting", values: {} }]
  if (found.status === "running") {
    return [
      {
        key: "imports.summary.importing",
        values: { done: found.done, total: found.total },
      },
    ]
  }
  if (found.status === "undone") {
    return [{ key: "imports.summary.undone", values: { count: found.undone } }]
  }
  const line: SummaryLine = [
    found.added > 0
      ? { key: "imports.summary.cameIn", values: { count: found.added } }
      : { key: "imports.summary.nothingCameIn", values: {} },
  ]
  if (found.already > 0) {
    line.push({
      key: "imports.summary.already",
      values: { count: found.already },
    })
  }
  if (found.failed > 0) {
    line.push({ key: "imports.summary.didnt", values: { count: found.failed } })
  }
  if (found.status === "cancelled" && found.stopped > 0) {
    line.push({
      key: "imports.summary.stopped",
      values: { count: found.stopped },
    })
  }
  if (found.status === "failed") {
    line.push({ key: "imports.summary.failed", values: {} })
  }
  return line
}
