import type { QueryKey } from "@tanstack/react-query"

import { LIVE_REFRESH } from "./state.ts"

/** A person's changes come in bursts, like ticking off a few items. */
const PERSON_WAIT_MS = 1_000

/** Merran's come from jobs, like an import saving a recipe and its photo. */
const MERRAN_WAIT_MS = 5_000

/**
 * Gathers changes over the live stream before fetching again, so a burst
 * of them is one round of requests rather than one per change. Whatever is
 * gathered goes together at the soonest time any change asked for.
 */
export function gatherChanges(refresh: (keys: QueryKey[]) => void) {
  const areas = new Set<string>()
  let due: number | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  function send() {
    const keys = new Map<string, QueryKey>()
    for (const area of areas) {
      for (const key of LIVE_REFRESH[area] ?? []) {
        keys.set(JSON.stringify(key), key)
      }
    }
    areas.clear()
    due = null
    timer = undefined
    refresh([...keys.values()])
  }

  function stop() {
    clearTimeout(timer)
    timer = undefined
    due = null
    areas.clear()
  }

  function add(area: string, byMerran: boolean) {
    areas.add(area)
    const at = Date.now() + (byMerran ? MERRAN_WAIT_MS : PERSON_WAIT_MS)
    // Something already waiting goes sooner: this change goes with it.
    if (due !== null && due <= at) return
    clearTimeout(timer)
    due = at
    timer = setTimeout(send, at - Date.now())
  }

  return { add, stop }
}
