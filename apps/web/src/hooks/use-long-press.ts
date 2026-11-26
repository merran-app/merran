import * as React from "react"

/** Where the finger was, in the viewport. */
export type PressPoint = { x: number; y: number }

/** How long a finger has to stay put, as the phone's own long press. */
const HOLD_MS = 500

/** How far a finger can wander and still be holding, not scrolling or swiping. */
const SLOP_PX = 10

/** How long after the finger lifts its mouse events can still turn up. */
const TRAILING_MS = 500

const TRAILING_EVENTS = ["mousedown", "mouseup", "click"] as const

function swallow(event: Event) {
  event.preventDefault()
  event.stopPropagation()
}

/**
 * Swallows the mouse events a phone sends for a long press once the finger
 * lifts, wherever they land. Whatever the long press opened is over the page
 * by then: a click there would open the thing pressed on, and a press on a
 * menu's backdrop would close the menu again. They end with the next touch,
 * or soon after the finger lifts.
 */
function swallowTrailingMouseEvents() {
  let timer: number | undefined

  function stop() {
    window.clearTimeout(timer)
    for (const type of TRAILING_EVENTS) {
      window.removeEventListener(type, swallow, true)
    }
    window.removeEventListener("pointerdown", stop, true)
    window.removeEventListener("pointerup", lifted, true)
    window.removeEventListener("pointercancel", lifted, true)
  }

  function lifted() {
    timer = window.setTimeout(stop, TRAILING_MS)
  }

  for (const type of TRAILING_EVENTS) {
    window.addEventListener(type, swallow, true)
  }
  window.addEventListener("pointerdown", stop, true)
  window.addEventListener("pointerup", lifted, true)
  window.addEventListener("pointercancel", lifted, true)
}

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
      // A phone that started selecting text under the finger anyway lets go.
      window.getSelection()?.removeAllRanges()
      swallowTrailingMouseEvents()
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
  }
}
