import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useCanGoBack, useRouter } from "@tanstack/react-router"
import * as React from "react"

import { onIos, standalone } from "@/features/install/install"
import { cn } from "@/lib/utils"

import { overlayOpen } from "./overlay-open"
import { EDGE_BACK_PX, edgeEnd, edgeStart, inEdgeZone } from "./swipe-math"

/**
 * Swipe in from the left edge to go back. Only in the installed app on an
 * iPhone or iPad, which has no back button and no back gesture of its own;
 * Android has its own, and Safari in a tab swipes back by itself. Cooking
 * is outside the app's layout, so its swipes between steps never meet this.
 */
export function EdgeBack() {
  const [installed] = React.useState(() => standalone() && onIos())
  if (!installed) return null
  return <Edge />
}

function Edge() {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const [drag, setDrag] = React.useState<{ dx: number; y: number } | null>(null)

  React.useEffect(() => {
    if (!canGoBack) return
    let from: { x: number; y: number } | null = null
    let going = false
    let last = { dx: 0, dy: 0 }

    function begin(event: TouchEvent) {
      const touch = event.touches[0]
      if (event.touches.length !== 1 || !touch) return
      if (!inEdgeZone(touch.clientX) || overlayOpen()) return
      from = { x: touch.clientX, y: touch.clientY }
      going = false
      last = { dx: 0, dy: 0 }
    }

    function track(event: TouchEvent) {
      const touch = event.touches[0]
      if (!from || !touch) return
      last = { dx: touch.clientX - from.x, dy: touch.clientY - from.y }

      // Nothing's held back until the finger's clearly going right, so a
      // scroll that starts at the edge stays the phone's own.
      if (!going) {
        const start = edgeStart(last.dx, last.dy)
        if (start === "wait") return
        if (start === "scroll") {
          from = null
          return
        }
        going = true
      }
      event.preventDefault()
      setDrag({ dx: Math.max(0, last.dx), y: touch.clientY })
    }

    function finish() {
      if (!from) return
      from = null
      setDrag(null)
      if (edgeEnd(last.dx, last.dy) === "back") router.history.back()
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
  }, [canGoBack, router])

  if (!drag) return null
  const reach = Math.min(drag.dx, EDGE_BACK_PX)
  const ready = drag.dx >= EDGE_BACK_PX
  return (
    <div
      aria-hidden
      style={{
        top: drag.y,
        transform: `translate(${reach - 40}px, -50%)`,
        opacity: 0.4 + (0.6 * reach) / EDGE_BACK_PX,
      }}
      className={cn(
        "pointer-events-none fixed left-0 z-50 grid size-10 place-items-center rounded-full border shadow-md",
        ready ? "bg-primary text-primary-foreground" : "bg-card text-foreground"
      )}
    >
      <HugeiconsIcon
        icon={ArrowLeft01Icon}
        strokeWidth={2}
        className="size-5"
      />
    </div>
  )
}
