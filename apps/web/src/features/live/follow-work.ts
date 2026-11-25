import { followEvery } from "./state.ts"

/**
 * How often to fetch again a query that shows work going on in the
 * background (a recipe's nutrition or photo, a price check): while it goes,
 * every 2 seconds, or as the live stream allows; once it's done, not at all.
 * The live stream says when it ends, but not when it's down or when a job
 * ends without a change to announce, and the page must never stay on
 * "working" with its buttons disabled.
 */
export function followWork(going: boolean) {
  return going ? followEvery(2000) : false
}
