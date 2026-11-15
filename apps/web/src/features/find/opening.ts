import type { FollowedSite } from "./queries"

/**
 * Posts waiting this long after a read aren't coming: a site that refuses
 * one leaves it waiting until the next read, hours later.
 */
const OPENING_FOR_MS = 3 * 60_000

/**
 * Whether Merran is still opening a site's posts, so its page should look
 * again soon: while it's read for the first time, or for a few minutes
 * after a read while its new posts are opened a few seconds apart.
 */
export function stillOpening(
  site: Pick<FollowedSite, "reading" | "waiting" | "readAt">,
  now = Date.now()
) {
  if (site.reading) return true
  if (site.waiting === 0 || !site.readAt) return false
  return now - Date.parse(site.readAt) < OPENING_FOR_MS
}
