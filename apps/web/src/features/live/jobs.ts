import type { QueryKey } from "@tanstack/react-query"

/**
 * What shows each kind of job as it goes, besides the job itself: fetched
 * again when the live stream says the job moved.
 */
const JOB_REFRESH: Record<string, QueryKey[]> = {
  "recipes.importLinks": [["link-imports"]],
  "recipes.tidy": [["review", "runs"]],
  "recipes.nutrition": [["recipes", "nutrition"]],
  "recipes.photos": [["recipes", "photos"]],
  "discover.search": [["recipes", "discover"]],
}

/** What to fetch again when one of the household's jobs moves. */
export function jobRefresh(job: { id: string; kind: string }): QueryKey[] {
  return [["jobs", job.id], ...(JOB_REFRESH[job.kind] ?? [])]
}
