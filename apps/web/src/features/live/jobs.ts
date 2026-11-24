import type { QueryKey } from "@tanstack/react-query"

/**
 * What shows each kind of job as it goes, besides the job itself: fetched
 * again when the live stream says the job moved.
 */
const JOB_REFRESH: Record<string, QueryKey[]> = {
  // Imports, on the Imports page and the Recipes banner.
  "recipes.importLinks": [["imports"]],
  "recipes.importFromApp": [["imports"]],
  "recipes.importLink": [["imports"]],
  "recipes.importVideo": [["imports"]],
  "household.import": [["imports"]],
  "recipes.tidy": [["review", "runs"]],
  "recipes.nutrition": [["recipes", "nutrition"]],
  "recipes.photos": [["recipes", "photos"]],
  "discover.search": [["recipes", "discover"]],
  // Nutrition and photos show through the recipe's own changes. A price
  // check shows on the stores card, and a receipt in the waiting list.
  "stores.prices": [["stores"]],
  "pantry.readReceipt": [["pantry", "receipts"]],
}

/** What to fetch again when one of the household's jobs moves. */
export function jobRefresh(job: { id: string; kind: string }): QueryKey[] {
  return [["jobs", job.id], ...(JOB_REFRESH[job.kind] ?? [])]
}
