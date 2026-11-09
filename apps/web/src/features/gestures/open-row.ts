import * as React from "react"

// Which swiped row is open on its button. One at a time: opening a row
// closes the last, and a tap anywhere else or a scroll closes it, as on a
// phone's own lists.

let openId: string | null = null
const listeners = new Set<() => void>()

function setOpenId(id: string | null) {
  if (openId === id) return
  openId = id
  if (id === null) stopWatching()
  else startWatching()
  for (const listener of listeners) listener()
}

/**
 * A tap outside the open row closes it. Each row says which it is in
 * `data-swipe-row`, so a tap on another row closes this one too.
 */
function closeOnOutsidePress(event: PointerEvent) {
  const target = event.target as Element | null
  const row = target?.closest("[data-swipe-row]")
  if (row?.getAttribute("data-swipe-row") !== openId) setOpenId(null)
}

function closeOnScroll() {
  setOpenId(null)
}

function startWatching() {
  window.addEventListener("pointerdown", closeOnOutsidePress, true)
  window.addEventListener("scroll", closeOnScroll, true)
}

function stopWatching() {
  window.removeEventListener("pointerdown", closeOnOutsidePress, true)
  window.removeEventListener("scroll", closeOnScroll, true)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Whether this row is the open one, and a way to open or close it. */
export function useOpenRow(id: string) {
  const open = React.useSyncExternalStore(
    subscribe,
    () => openId === id,
    () => false
  )
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (next) setOpenId(id)
      else if (openId === id) setOpenId(null)
    },
    [id]
  )
  return { open, setOpen }
}
