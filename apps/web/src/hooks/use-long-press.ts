import * as React from "react"

/** Where the finger was, in the viewport. */
export type PressPoint = { x: number; y: number }

/** How long a finger has to stay put, as the phone's own long press. */
const HOLD_MS = 500

/** How far a finger can wander and still be holding, not scrolling or swiping. */
const SLOP_PX = 10

/**
 * A long press (half a second, without moving) on a touch screen. A mouse
 * has a right click instead.
 *
 * Only a press on the element itself counts. A menu or dialog opened from
 * inside it is drawn elsewhere on the page, but React still hands its
 * presses up to the element, sometimes twice over.
 */
export function useLongPress(
  onLongPress: (point: PressPoint) => void,
  enabled = true
) {
  const timer = React.useRef<number | null>(null)
  const from = React.useRef<PressPoint | null>(null)
  const fired = React.useRef(false)

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    from.current = null
  }

  function begin(event: React.PointerEvent) {
    if (!enabled || event.pointerType === "mouse") return
    if (!event.currentTarget.contains(event.target as Node)) return
    cancel()
    fired.current = false
    const point = { x: event.clientX, y: event.clientY }
    from.current = point
    timer.current = window.setTimeout(() => {
      timer.current = null
      fired.current = true
      navigator.vibrate?.(10)
      onLongPress(point)
    }, HOLD_MS)
  }

  function track(event: React.PointerEvent) {
    if (!from.current) return
    const moved =
      Math.abs(event.clientX - from.current.x) +
      Math.abs(event.clientY - from.current.y)
    if (moved > SLOP_PX) cancel()
  }

  /** Swallows the click that ends a long press, so it doesn't open the thing. */
  function swallowClick(event: React.MouseEvent) {
    if (!fired.current) return
    event.preventDefault()
    event.stopPropagation()
    fired.current = false
  }

  return {
    onPointerDown: begin,
    onPointerMove: track,
    onPointerUp: cancel,
    onPointerCancel: cancel,
    // Something else took the finger, like a row that swipes: from then on
    // this sees no more moves and no lift, so it has to give up now.
    onLostPointerCapture: cancel,
    onContextMenu: (event: React.MouseEvent) => {
      if (from.current || fired.current) event.preventDefault()
    },
    onClickCapture: swallowClick,
  }
}
