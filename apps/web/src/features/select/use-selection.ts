import * as React from "react"

/**
 * Select mode for a page of things (recipes now; list items, pantry items
 * and meals later): which ids are picked. Escape or leaving the page ends it.
 */
export function useSelection() {
  const [selecting, setSelecting] = React.useState(false)
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(new Set())

  const done = React.useCallback(() => {
    setSelecting(false)
    setPicked(new Set())
  }, [])

  React.useEffect(() => {
    if (!selecting) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("[role=dialog]")) {
        done()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selecting, done])

  /** Starts selecting, with this one picked when given (Select in its menu). */
  const start = React.useCallback((id?: string) => {
    setSelecting(true)
    setPicked(id ? new Set([id]) : new Set())
  }, [])

  const toggle = React.useCallback(
    (id: string) =>
      setPicked((current) => {
        const next = new Set(current)
        if (!next.delete(id)) next.add(id)
        return next
      }),
    []
  )

  /** Picks all of these, or none when they're all picked already. */
  const toggleAll = React.useCallback(
    (ids: readonly string[]) =>
      setPicked((current) =>
        ids.length > 0 && ids.every((id) => current.has(id))
          ? new Set()
          : new Set(ids)
      ),
    []
  )

  /** Leaves out what's no longer there (deleted, or filtered away). */
  const keepOnly = React.useCallback(
    (ids: readonly string[]) =>
      setPicked((current) => {
        const there = new Set(ids)
        const next = new Set([...current].filter((id) => there.has(id)))
        return next.size === current.size ? current : next
      }),
    []
  )

  return {
    selecting,
    picked,
    count: picked.size,
    isPicked: (id: string) => picked.has(id),
    start,
    toggle,
    toggleAll,
    keepOnly,
    done,
  }
}

export type Selection = ReturnType<typeof useSelection>

/** Keeps the picks to what the page is showing. */
export function useSelectionKeepOnly(
  selection: Selection,
  ids: readonly string[]
) {
  const key = ids.join(",")
  const { keepOnly } = selection
  React.useEffect(() => {
    keepOnly(key ? key.split(",") : [])
  }, [key, keepOnly])
}
