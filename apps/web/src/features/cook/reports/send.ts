import { api } from "@/lib/api/client"

import type { TimerReport } from "./timer-report"

// What cook view tells the server about cooking, so a webhook can turn on
// the hood fan or say a timer's done. None of it may get in the way of
// cooking: a call that fails is dropped, never tried again or saved up, as
// "started cooking" an hour late is no use to anyone (docs/webhooks.md).

export type NewCooking = {
  recipe: string
  with?: string | null
  meal?: string | null
  servings?: number | null
}

/** Starts a session, and says its id, or null if it couldn't. */
export async function startCooking(body: NewCooking): Promise<string | null> {
  try {
    const { data } = await api.POST("/api/cooking/sessions", { body })
    return data?.id ?? null
  } catch {
    return null
  }
}

/**
 * Still cooking: "open" if the session goes on, "gone" if it's ended (a
 * new one is needed), or "failed" if the server couldn't be asked.
 */
export async function checkIn(
  sessionId: string,
  servings?: number | null
): Promise<"open" | "gone" | "failed"> {
  try {
    const { response } = await api.PATCH("/api/cooking/sessions/{sessionId}", {
      params: { path: { sessionId } },
      body: servings === undefined ? {} : { servings },
    })
    if (response.ok) return "open"
    return response.status === 404 ? "gone" : "failed"
  } catch {
    return "failed"
  }
}

/** Cook view was left: cooking ends, or ends once its timers are done. */
export function leave(sessionId: string) {
  api
    .POST("/api/cooking/sessions/{sessionId}/end", {
      params: { path: { sessionId } },
      body: {},
    })
    .catch(() => {})
}

/**
 * The page is going away, which may be a reload: cooking ends in a minute
 * unless cook view checks in again. A beacon still goes as the page closes.
 */
export function closeSoon(sessionId: string) {
  try {
    const body = new Blob([JSON.stringify({ soon: true })], {
      type: "application/json",
    })
    navigator.sendBeacon(`/api/cooking/sessions/${sessionId}/end`, body)
  } catch {
    // No beacon: the session ends when cook view has been quiet a while.
  }
}

/** A timer started, given more time, or cancelled. */
export function sendTimer(
  sessionId: string,
  timerId: string,
  report: TimerReport
) {
  const params = { path: { sessionId, timerId } }
  const path = "/api/cooking/sessions/{sessionId}/timers/{timerId}" as const
  const call =
    report.kind === "set"
      ? api.PUT(path, {
          params,
          body: { label: report.label, seconds: report.seconds },
        })
      : api.DELETE(path, { params })
  call.catch(() => {})
}
