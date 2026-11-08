// The sums behind the phone's gestures: which way a finger's going, how far
// is far enough, and what letting go does. Plain functions, so they can be
// tested without a screen.

/** How far a finger moves before we decide it's a swipe or a scroll. */
export const LOCK_PX = 10
/** A swipe this far opens a row on its button. */
export const OPEN_PX = 72
/** A swipe past this share of the row's width does the action. */
export const COMMIT_FRACTION = 0.5
/** A finger this fast is a flick, which does the action sooner. */
export const FLICK_PX_PER_MS = 0.5
/** How far the spinner has to come down before letting go refreshes. */
export const PULL_PX = 64
/** A touch this close to the left edge is the start of going back. */
export const EDGE_START_PX = 20
/** How far from the edge going back has to come. */
export const EDGE_BACK_PX = 80

export type Axis = "x" | "y"

/** "start" is a swipe right, to the action on the left; "end" a swipe left. */
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
 * What letting go of a row does. `offset` and `velocity` are positive to
 * the right; a side without an action always closes.
 */
export function swipeEnd(input: {
  offset: number
  width: number
  velocity: number
  has: { start: boolean; end: boolean }
}): SwipeEnd {
  const { offset, width, velocity, has } = input
  const side: SwipeSide = offset > 0 ? "start" : "end"
  if (offset === 0 || !has[side]) return { kind: "close" }

  const distance = Math.abs(offset)
  const flicked =
    Math.abs(velocity) >= FLICK_PX_PER_MS &&
    Math.sign(velocity) === Math.sign(offset)

  if (pastCommit(offset, width)) return { kind: "commit", side }
  if (flicked && distance >= OPEN_PX) return { kind: "commit", side }
  if (distance >= OPEN_PX) return { kind: "open", side }
  return { kind: "close" }
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

/** Whether a touch starts close enough to the left edge to go back. */
export function inEdgeZone(x: number): boolean {
  return x <= EDGE_START_PX
}

/** What letting go of a swipe from the edge does: far enough, and mostly sideways. */
export function edgeEnd(dx: number, dy: number): "back" | "cancel" {
  return dx >= EDGE_BACK_PX && dx > Math.abs(dy) ? "back" : "cancel"
}
