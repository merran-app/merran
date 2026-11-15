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
 * Query keys gathered to fetch again together, at the soonest time any of
 * them asked for, each once.
 */
function batch(refresh: (keys: QueryKey[]) => void) {
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

  function add(more: readonly QueryKey[], waitMs: number) {
    for (const key of more) keys.set(JSON.stringify(key), key)
    const at = Date.now() + waitMs
    // Something already waiting goes sooner: this change goes with it.
    if (due !== null && due <= at) return
    clearTimeout(timer)
    due = at
    timer = setTimeout(send, at - Date.now())
  }

  function stop() {
    clearTimeout(timer)
    timer = undefined
    due = null
    keys.clear()
  }

  return { add, stop }
}

/**
 * Gathers changes over the live stream before fetching again, so a burst
 * of them is one round of requests rather than one per change. A job's
 * moves are gathered apart from what changed in the areas: an import says
 * both as it goes, and its moves, a second apart, would otherwise fetch
 * the whole library every second rather than every five.
 */
export function gatherChanges(refresh: (keys: QueryKey[]) => void) {
  const areas = batch(refresh)
  const jobs = batch(refresh)

  /** Something in an area changed, by a person or by Merran. */
  function add(area: string, byMerran: boolean) {
    areas.add(
      LIVE_REFRESH[area] ?? [],
      byMerran ? MERRAN_WAIT_MS : PERSON_WAIT_MS
    )
  }

  /** One of the household's jobs started, moved on or ended. */
  function addJob(job: { id: string; kind: string }) {
    jobs.add(jobRefresh(job), JOB_WAIT_MS)
  }

  function stop() {
    areas.stop()
    jobs.stop()
  }

  return { add, addJob, stop }
}
