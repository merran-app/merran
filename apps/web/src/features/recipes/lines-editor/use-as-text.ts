import * as React from "react"

import type { LineList } from "./line-rows"

/** Where each list's choice is kept, so the two cards remember their own. */
const KEYS: Record<LineList, string> = {
  steps: "merran-steps-as-text",
  ingredients: "merran-ingredients-as-text",
}

function read(list: LineList) {
  try {
    return localStorage.getItem(KEYS[list]) === "true"
  } catch {
    return false
  }
}

/** Whether a list is edited as text, one per line, or in a box each. Kept on this device. */
export function useAsText(list: LineList) {
  const [asText, setAsText] = React.useState(() => read(list))
  const change = React.useCallback(
    (next: boolean) => {
      setAsText(next)
      try {
        localStorage.setItem(KEYS[list], String(next))
      } catch {
        // It still changes, just isn't remembered.
      }
    },
    [list]
  )
  return [asText, change] as const
}
