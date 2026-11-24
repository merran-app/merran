import type { QueryKey } from "@tanstack/react-query"

/** What to fetch again when something in an area changes. */
export const LIVE_REFRESH: Record<string, QueryKey[]> = {
  plan: [["plan"]],
  list: [
    ["list"],
    ["stores", "kroger", "basket"],
    ["stores", "walmart", "basket"],
  ],
  // What's at home is what the list counts on.
  pantry: [["pantry"], ["list", "covered"]],
  // What AI suggests for recipes is in Review.
  recipes: [["recipes"], ["tags"], ["review"]],
  household: [["household"]],
}

/**
 * In those areas, but changed by what doesn't say so on the stream: recipe
 * sites read for the whole server, prices checked and webhooks delivered by
 * jobs, and receipts read. These are fetched again as any other query is.
 */
const NOT_LIVE: QueryKey[] = [
  ["recipes", "sites"],
  ["recipes", "collections"],
  ["list", "prices"],
  ["household", "webhooks"],
  ["pantry", "receipts"],
]

/**
 * The server pings every 25 seconds, so a minute without a word means the
 * stream is gone, even when it looks open, as after a phone wakes up.
 */
const TRUSTED_FOR_MS = 60_000

/** How long a query stays fresh while the live stream would say it changed. */
const FRESH_WHILE_LIVE_MS = 5 * 60_000

/** How long any other query stays fresh. */
const FRESH_MS = 30_000

let lastHeard: number | null = null

/** A message came over the live stream, pings included. */
export function heardFromLive(now = Date.now()) {
  lastHeard = now
}

/** The live stream closed. */
export function lostLive() {
  lastHeard = null
}

/** Whether the live stream is working: something came in the last minute. */
export function liveConnected(now = Date.now()) {
  return lastHeard !== null && now - lastHeard < TRUSTED_FOR_MS
}

function startsWith(queryKey: QueryKey, prefix: QueryKey) {
  return prefix.every((part, index) => queryKey[index] === part)
}

/** Whether the live stream says when this query's data changes. */
export function coveredByLive(queryKey: QueryKey) {
  if (NOT_LIVE.some((prefix) => startsWith(queryKey, prefix))) return false
  return Object.values(LIVE_REFRESH).some((keys) =>
    keys.some((prefix) => startsWith(queryKey, prefix))
  )
}

/**
 * How long a query's data stays fresh: longer while the live stream would
 * tell this page it changed, since then nothing needs asking again.
 */
export function freshFor(queryKey: QueryKey, now = Date.now()) {
  return coveredByLive(queryKey) && liveConnected(now)
    ? FRESH_WHILE_LIVE_MS
    : FRESH_MS
}

/** Whether coming back to the app fetches a query again, once it's stale. */
export function refetchOnFocus(queryKey: QueryKey, now = Date.now()) {
  return !(coveredByLive(queryKey) && liveConnected(now))
}
