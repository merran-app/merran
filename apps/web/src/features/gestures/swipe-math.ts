// The sums behind the phone's gestures: which way a finger's going, how far
// is far enough, and what letting go does. Plain functions, so they can be
// tested without a screen.
//
// They measure along the line of text, not across the screen: positive is
// towards the end of a line, which is left in a right-to-left language.
// `alongLine` turns a touch's screen x into that.

/** How far a finger moves before we decide it's a swipe or a scroll. */
export const LOCK_PX = 10
/** A swipe this far opens a row on its button. */
export const OPEN_PX = 72
/** A swipe past this share of the row's width does the action. */
export const COMMIT_FRACTION = 0.5
/** A finger this fast is a flick, which does the action sooner. */
export const FLICK_PX_PER_MS = 0.5
/** How far back a flick's speed is measured, and how long a pause undoes it. */
export const FLICK_WINDOW_MS = 100
/** How far the spinner has to come down before letting go refreshes. */
export const PULL_PX = 64
/** A touch this close to the edge lines start from is the start of going back. */
export const EDGE_START_PX = 20
/** How far from the edge going back has to come. */
export const EDGE_BACK_PX = 80

export type Axis = "x" | "y"

/**
 * "start" swipes towards the end of the line, showing the action at its
 * start: in English, a swipe right shows the action on the left. "end" is
 * the other way.
 */
export type SwipeSide = "start" | "end"

export type SwipeEnd =
  | { kind: "close" }
  | { kind: "open"; side: SwipeSide }
  | { kind: "commit"; side: SwipeSide }

/**
 * Which way a finger's going, once it's gone far enough to say. Ties go to
 * scrolling, so a list never moves sideways under a finger that meant to
 * scroll.
 */
export function lockAxis(dx: number, dy: number): Axis | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_PX) return null
  return Math.abs(dx) > Math.abs(dy) ? "x" : "y"
}

/**
 * What letting go of a row does. `offset` and `velocity` are positive
 * towards the end of the line; a side without an action always closes. A
 * flick only does what `flicks` allows: something that takes a row away,
 * like Remove, always needs the swipe past halfway, where the phone buzzes.
 */
export function swipeEnd(input: {
  offset: number
  width: number
  velocity: number
  has: { start: boolean; end: boolean }
  flicks: { start: boolean; end: boolean }
}): SwipeEnd {
  const { offset, width, velocity, has, flicks } = input
  const side: SwipeSide = offset > 0 ? "start" : "end"
  if (offset === 0 || !has[side]) return { kind: "close" }

  const distance = Math.abs(offset)
  const flicked =
    flicks[side] &&
    Math.abs(velocity) >= FLICK_PX_PER_MS &&
    Math.sign(velocity) === Math.sign(offset)

  if (pastCommit(offset, width)) return { kind: "commit", side }
  if (flicked && distance >= OPEN_PX) return { kind: "commit", side }
  if (distance >= OPEN_PX) return { kind: "open", side }
  return { kind: "close" }
}

/**
 * How fast a finger was going as it let go, in px per ms: over the moves
 * in the last `FLICK_WINDOW_MS`, so one jumpy sample doesn't make a flick,
 * and none at all if it stopped before letting go.
 */
export function velocityOf(
  samples: readonly { x: number; t: number }[],
  now: number
): number {
  const last = samples.at(-1)
  if (!last || now - last.t > FLICK_WINDOW_MS) return 0
  const first = samples.find((sample) => last.t - sample.t <= FLICK_WINDOW_MS)
  if (!first || first === last) return 0
  return (last.x - first.x) / (last.t - first.t)
}

/** Whether letting go here does the action: where the phone buzzes. */
export function pastCommit(offset: number, width: number): boolean {
  return Math.abs(offset) >= width * COMMIT_FRACTION
}

/** How far the spinner comes for a pull: less than the finger, the further it goes. */
export function resist(distance: number): number {
  if (distance <= 0) return 0
  return distance / (1 + distance / 200)
}

/** What letting go of a pull does. */
export function pullEnd(distance: number): "refresh" | "cancel" {
  return resist(distance) >= PULL_PX ? "refresh" : "cancel"
}

/**
 * How far along the line a point on the screen is: from the left edge, or
 * from the right in a right-to-left language. Distances between two points
 * come out positive towards the end of the line.
 */
export function alongLine(
  x: number,
  screenWidth: number,
  direction: "ltr" | "rtl"
): number {
  return direction === "rtl" ? screenWidth - x : x
}

/** Whether a touch, `alongLine`, starts close enough to the edge to go back. */
export function inEdgeZone(x: number): boolean {
  return x <= EDGE_START_PX
}

/** What letting go of a swipe from the edge does: far enough, and mostly sideways. */
export function edgeEnd(dx: number, dy: number): "back" | "cancel" {
  return dx >= EDGE_BACK_PX && dx > Math.abs(dy) ? "back" : "cancel"
}

/**
 * Whether a touch from the edge is going back yet. It waits until the
 * finger's clearly going along the line, so a scroll that starts at the edge
 * stays a scroll.
 */
export function edgeStart(dx: number, dy: number): "wait" | "back" | "scroll" {
  const axis = lockAxis(dx, dy)
  if (axis === null) return "wait"
  return axis === "x" && dx > 0 ? "back" : "scroll"
}
