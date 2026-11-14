import * as React from "react"

const KEY = "merran-steps-as-text"

function read() {
  try {
    return localStorage.getItem(KEY) === "true"
  } catch {
    return false
  }
}

/** Whether steps are edited as text, one per line, or in a box each. Kept on this device. */
export function useStepsAsText() {
  const [asText, setAsText] = React.useState(read)
  const change = React.useCallback((next: boolean) => {
    setAsText(next)
    try {
      localStorage.setItem(KEY, String(next))
    } catch {
      // It still changes, just isn't remembered.
    }
  }, [])
  return [asText, change] as const
}
