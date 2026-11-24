// Receipts the person is watching being read on the scan page. A notice
// for one would only tell them what they're looking at, so it's skipped
// while they're there. Kept apart from React so it can be tested alone.

const watched = new Set<string>()

/**
 * Starts watching a receipt; the returned function stops. Safe to call
 * more than once, so a page can stop on finishing and again on leaving.
 */
export function watchReceipt(receiptId: string): () => void {
  watched.add(receiptId)
  return () => {
    watched.delete(receiptId)
  }
}

/** Whether a job's result is for a receipt someone is watching. */
export function isWatchedRead(job: {
  kind: string
  result: { [key: string]: unknown } | null
}): boolean {
  if (job.kind !== "pantry.readReceipt") return false
  const receiptId = job.result?.receiptId
  return typeof receiptId === "string" && watched.has(receiptId)
}
