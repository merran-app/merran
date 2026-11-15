import { queryOptions } from "@tanstack/react-query"

import { followEvery } from "@/features/live/state"
import { api, unwrap, type Schemas } from "@/lib/api/client"

export type Job = Schemas["Job"]

/** Still to finish: waiting or running. */
export const isActive = (job: Pick<Job, "status">) =>
  job.status === "queued" || job.status === "running"

/** One of the household's jobs, checked every second until it's finished. */
export const householdJobQuery = (jobId: string) =>
  queryOptions({
    queryKey: ["jobs", jobId],
    queryFn: () =>
      unwrap(
        api.GET("/api/households/current/jobs/{jobId}", {
          params: { path: { jobId } },
        })
      ),
    // The live stream says when it moves; asking is for when it can't.
    refetchInterval: (query) =>
      query.state.data && !isActive(query.state.data)
        ? false
        : followEvery(1000),
  })
