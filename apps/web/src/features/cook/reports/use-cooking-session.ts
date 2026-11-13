import * as React from "react"

import { forgetSession, rememberedSession, rememberSession } from "./remembered"
import {
  checkIn,
  closeSoon,
  leave,
  startCooking,
  type NewCooking,
} from "./send"

// Cook view's cooking session: started when someone leaves Get ready,
// checked in on while cook view is open, and left when it is. The server
// ends it a minute after the page goes away unless it comes back, so a
// reload carries on with the same one (docs/webhooks.md).

/** How often cook view says it's still cooking, while it's on screen. */
const CHECK_IN_MS = 5 * 60_000

/** Starts under way, by cooking, so a second mount waits for the first. */
const starting = new Map<string, Promise<string | null>>()

/** Leavings put off a moment, in case cook view mounts again straight away. */
const leavings = new Map<string, ReturnType<typeof setTimeout>>()

type Cooking = Omit<NewCooking, "servings">

/** Starts a session for this cooking, once, and remembers it. */
function startOnce(
  progressId: string,
  body: NewCooking
): Promise<string | null> {
  const pending = starting.get(progressId)
  if (pending) return pending

  const started = startCooking(body)
    .then((id) => {
      if (id) rememberSession(progressId, id)
      return id
    })
    .finally(() => starting.delete(progressId))
  starting.set(progressId, started)
  return started
}

/**
 * Leaves a session after this task, so React mounting cook view again at
 * once (as it does in development) carries on instead of ending it.
 */
function leaveSoon(sessionId: string) {
  leavings.set(
    sessionId,
    setTimeout(() => {
      leavings.delete(sessionId)
      leave(sessionId)
    }, 0)
  )
}

function stayOn(sessionId: string) {
  clearTimeout(leavings.get(sessionId))
  leavings.delete(sessionId)
}

/**
 * The cooking session cook view is in, for its timers and Made it. Nothing
 * here waits on the server or shows an error: a report that fails is
 * dropped, and cooking goes on.
 */
export function useCookingSession({
  enabled,
  started,
  progressId,
  cooking,
  servings,
}: {
  /** False for a guest cooking from a shared link, who never reports. */
  enabled: boolean
  /** Someone's left Get ready, or there was nothing to get ready. */
  started: boolean
  /** Which cooking this is: the recipe, or a meal of it. */
  progressId: string
  cooking: Cooking
  servings: number | null
}): { sessionId: string | null; made: () => void } {
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  // Once begun, going back to Get ready doesn't end cooking.
  const [begun, setBegun] = React.useState(started)
  const current = React.useRef<string | null>(null)
  const finished = React.useRef(false)
  const latest = React.useRef({ cooking, servings })
  latest.current = { cooking, servings }

  React.useEffect(() => {
    if (started) setBegun(true)
  }, [started])

  const adopt = React.useCallback((id: string) => {
    current.current = id
    setSessionId(id)
  }, [])

  /** A new session, when the one this was in has ended. */
  const startAgain = React.useCallback(async () => {
    forgetSession(progressId)
    const id = await startOnce(progressId, {
      ...latest.current.cooking,
      servings: latest.current.servings,
    })
    if (id && !finished.current) adopt(id)
  }, [adopt, progressId])

  /** Still cooking: checks in, and starts again if the session has ended. */
  const keepGoing = React.useCallback(async () => {
    const id = current.current
    if (!id) return
    const answer = await checkIn(id, latest.current.servings)
    if (answer === "gone" && current.current === id) await startAgain()
  }, [startAgain])

  // Starts cooking, or carries on with this device's session for it.
  React.useEffect(() => {
    if (!enabled || !begun) return
    let active = true

    async function begin() {
      const remembered = rememberedSession(progressId)
      if (remembered) {
        stayOn(remembered)
        const answer = await checkIn(remembered, latest.current.servings)
        if (!active) return
        // A check-in that couldn't be made keeps the session: it's likely
        // still open, and starting another would say cooking started twice.
        if (answer !== "gone") {
          adopt(remembered)
          return
        }
      }
      const id = await startOnce(progressId, {
        ...latest.current.cooking,
        servings: latest.current.servings,
      })
      if (active && id) adopt(id)
    }

    void begin()
    return () => {
      active = false
      const id = current.current
      current.current = null
      if (id && !finished.current) leaveSoon(id)
    }
  }, [adopt, begun, enabled, progressId])

  // Checks in while cook view is on screen, and says when the page goes.
  React.useEffect(() => {
    if (!sessionId) return

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void keepGoing()
    }
    function onPageShow(event: PageTransitionEvent) {
      // Back from the back-forward cache, after its pagehide said goodbye.
      if (event.persisted) void keepGoing()
    }
    function onPageHide() {
      if (current.current && !finished.current) closeSoon(current.current)
    }
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void keepGoing()
    }, CHECK_IN_MS)

    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("pageshow", onPageShow)
    window.addEventListener("pagehide", onPageHide)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("pageshow", onPageShow)
      window.removeEventListener("pagehide", onPageHide)
    }
  }, [keepGoing, sessionId])

  // Servings changed: the session says so.
  const sentServings = React.useRef(servings)
  React.useEffect(() => {
    if (!sessionId || sentServings.current === servings) return
    sentServings.current = servings
    void keepGoing()
  }, [keepGoing, servings, sessionId])

  /** Made it ended the session: nothing more to say about it. */
  const made = React.useCallback(() => {
    finished.current = true
    current.current = null
    forgetSession(progressId)
  }, [progressId])

  return { sessionId, made }
}
