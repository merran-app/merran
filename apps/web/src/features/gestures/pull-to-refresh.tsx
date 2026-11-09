import { Loading03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { standalone } from "@/features/install/install"
import { cn } from "@/lib/utils"

import { overlayOpen } from "./overlay-open"
import { lockAxis, PULL_PX, pullEnd, resist } from "./swipe-math"

/**
 * Pull down at the top of a page to fetch it again. Only in the installed
 * app: a browser already does this itself, and two would fight.
 */
export function PullToRefresh() {
  const [installed] = React.useState(standalone)
  if (!installed) return null
  return <Pulling />
}

function Pulling() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [pull, setPull] = React.useState(0)
  const [refreshing, setRefreshing] = React.useState(false)

  // The page stops bouncing at the top, so the pull is ours to draw.
  // "none", not "contain": iOS still bounces the page itself with contain.
  React.useEffect(() => {
    const root = document.documentElement
    const was = root.style.overscrollBehaviorY
    root.style.overscrollBehaviorY = "none"
    return () => {
      root.style.overscrollBehaviorY = was
    }
  }, [])

  React.useEffect(() => {
    let from: { x: number; y: number } | null = null
    let pulling = false
    let distance = 0
    let busy = false

    function begin(event: TouchEvent) {
      const touch = event.touches[0]
      if (busy || event.touches.length !== 1 || !touch) return
      if (window.scrollY > 0 || overlayOpen()) return
      from = { x: touch.clientX, y: touch.clientY }
      pulling = false
    }

    function track(event: TouchEvent) {
      const touch = event.touches[0]
      if (!from || !touch) return
      const dx = touch.clientX - from.x
      const dy = touch.clientY - from.y

      if (!pulling) {
        const axis = lockAxis(dx, dy)
        if (axis === null) return
        // Sideways, or scrolling down the page: not a pull.
        if (axis === "x" || dy < 0) {
          from = null
          return
        }
        pulling = true
      }
      event.preventDefault()
      distance = Math.max(0, dy)
      setPull(resist(distance))
    }

    async function finish() {
      if (!from) return
      from = null
      if (!pulling) return
      pulling = false

      if (pullEnd(distance) === "cancel") {
        setPull(0)
        return
      }
      busy = true
      setRefreshing(true)
      setPull(PULL_PX)
      try {
        await queryClient.refetchQueries({ type: "active" })
      } finally {
        busy = false
        setRefreshing(false)
        setPull(0)
      }
    }

    window.addEventListener("touchstart", begin, { passive: true })
    window.addEventListener("touchmove", track, { passive: false })
    window.addEventListener("touchend", finish)
    window.addEventListener("touchcancel", finish)
    return () => {
      window.removeEventListener("touchstart", begin)
      window.removeEventListener("touchmove", track)
      window.removeEventListener("touchend", finish)
      window.removeEventListener("touchcancel", finish)
    }
  }, [queryClient])

  const shown = pull > 0 || refreshing
  return (
    <>
      <div
        aria-hidden
        style={{
          transform: `translate(-50%, ${pull - 44}px)`,
          opacity: Math.min(1, pull / PULL_PX),
        }}
        className={cn(
          "pointer-events-none fixed top-[env(safe-area-inset-top)] left-1/2 z-50 grid size-10 place-items-center rounded-full border bg-card text-primary shadow-md",
          !shown && "invisible",
          pull === 0 || refreshing ? "transition-all duration-200" : ""
        )}
      >
        <HugeiconsIcon
          icon={Loading03Icon}
          strokeWidth={2}
          style={refreshing ? undefined : { rotate: `${pull * 4}deg` }}
          className={cn("size-5", refreshing && "animate-spin")}
        />
      </div>
      <span role="status" className="sr-only">
        {refreshing ? t("gestures.refreshing") : ""}
      </span>
    </>
  )
}
