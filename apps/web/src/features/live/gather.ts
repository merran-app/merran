import type { QueryKey } from "@tanstack/react-query"

import { jobRefresh } from "./jobs.ts"
import { LIVE_REFRESH } from "./state.ts"

/** A person's changes come in bursts, like ticking off a few items. */
const PERSON_WAIT_MS = 1_000

/** Merran's come from jobs, like an import saving a recipe and its photo. */
const MERRAN_WAIT_MS = 5_000

/**
 * A job's moves wait as a person's do: someone is usually watching it go,
 * and it says how it's going at most twice a second.
 */
const JOB_WAIT_MS = 1_000

/**
 * Gathers changes over the live stream before fetching again, so a burst
 * of them is one round of requests rather than one per change. Whatever is
 * gathered goes together at the soonest time any change asked for.
 */
export function gatherChanges(refresh: (keys: QueryKey[]) => void) {
  /** What to fetch again, by its key as text, so each goes once. */
  const keys = new Map<string, QueryKey>()
  let due: number | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  function send() {
    const gathered = [...keys.values()]
    keys.clear()
    due = null
    timer = undefined
    refresh(gathered)
  }

  function stop() {
    clearTimeout(timer)
    timer = undefined
    due = null
    keys.clear()
  }

  function gather(more: readonly QueryKey[], waitMs: number) {
    for (const key of more) keys.set(JSON.stringify(key), key)
    const at = Date.now() + waitMs
    // Something already waiting goes sooner: this change goes with it.
    if (due !== null && due <= at) return
    clearTimeout(timer)
    due = at
    timer = setTimeout(send, at - Date.now())
  }

  /** Something in an area changed, by a person or by Merran. */
  function add(area: string, byMerran: boolean) {
    gather(LIVE_REFRESH[area] ?? [], byMerran ? MERRAN_WAIT_MS : PERSON_WAIT_MS)
  }

  /** One of the household's jobs started, moved on or ended. */
  function addJob(job: { id: string; kind: string }) {
    gather(jobRefresh(job), JOB_WAIT_MS)
  }

  return { add, addJob, stop }
}
