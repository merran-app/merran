import { followWork } from "../../live/follow-work.ts"

/**
 * How often to fetch the waiting receipts again: while one is still being
 * read, every 2 seconds or as the live stream allows, so the row never
 * stays on "Reading…" when the stream is down; otherwise not at all.
 */
export function receiptsRefetchInterval(
  data: { receipts: { status: string }[] } | undefined
) {
  return followWork(
    data?.receipts.some((receipt) => receipt.status === "reading") ?? false
  )
}
