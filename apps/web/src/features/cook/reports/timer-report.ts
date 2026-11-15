import type { Timer } from "../timers.tsx"

/** What a change to a timer tells the server, if anything. */
export type TimerReport =
  { kind: "set"; label: string; seconds: number } | { kind: "cancel" }

/**
 * What changing a timer from `before` to `after` tells the server: a timer
 * started, or given more time, is `set` with the seconds now left (the
 * server works out when it ends, so a clock that's off doesn't move it);
 * one taken away while running is `cancel`. Going off is the server's to
 * say, and dismissing one that's gone off isn't news. Timers outside a
 * cooking session, like a guest's, tell it nothing.
 */
export function timerReport(
  before: Timer | undefined,
  after: Timer | undefined,
  now: number
): TimerReport | null {
  const session = after?.cooking?.session ?? before?.cooking?.session
  if (!session) return null

  if (!after) {
    if (!before || before.done) return null
    return { kind: "cancel" }
  }
  if (after.done) return null

  const changed = !before || before.done || before.endsAt !== after.endsAt
  if (!changed) return null

  return {
    kind: "set",
    label: after.label,
    seconds: Math.max(1, Math.ceil((after.endsAt - now) / 1000)),
  }
}
