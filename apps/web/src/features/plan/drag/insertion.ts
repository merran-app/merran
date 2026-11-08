// Where a dragged dish goes among its meal's other dishes, worked out from
// where they are on screen, so it can be tested without a browser.

export type Box = { left: number; top: number; width: number; height: number }

const BAR = 3
/** Where the bar goes beyond the first or last dish: half the usual gap. */
const OUTSIDE = 3

/**
 * A grid, like the pool on wide screens: some dishes share a row. Ask with
 * every dish's tile, the dragged one included: it may be what makes a row.
 */
export function inRows(boxes: Box[]) {
  return boxes.some((box, index) =>
    boxes.some((other, otherIndex) => {
      return otherIndex !== index && other.top === box.top
    })
  )
}

/**
 * How many of the other dishes, in reading order, the pointer is past: the
 * index to put the dragged dish at. In a stack it's past a dish below the
 * dish's middle; in a grid, right of its middle within its row.
 */
export function insertionIndex(
  boxes: Box[],
  point: { x: number; y: number },
  rows = inRows(boxes)
) {
  let index = 0
  for (const box of boxes) {
    const bottom = box.top + box.height
    let past: boolean
    if (point.y > bottom) {
      past = true
    } else if (rows) {
      past = point.y >= box.top && point.x > box.left + box.width / 2
    } else {
      past = point.y > box.top + box.height / 2
    }
    if (past) index++
  }
  return index
}

/** The bar showing where the dish will go: across a stack, upright in a row. */
export function insertionBar(
  boxes: Box[],
  index: number,
  rows = inRows(boxes)
): Box {
  // The dish the bar goes after, and the one it goes before.
  const after = boxes[index - 1]
  const before = boxes[index]
  const next = before ?? after!

  if (rows) {
    let centre: number
    if (!before) {
      centre = after!.left + after!.width + OUTSIDE
    } else if (after && after.top === before.top) {
      centre = (after.left + after.width + before.left) / 2
    } else {
      // First in its row: just left of it.
      centre = before.left - OUTSIDE
    }
    return {
      left: centre - BAR / 2,
      top: next.top,
      width: BAR,
      height: next.height,
    }
  }

  let centre: number
  if (!before) {
    centre = after!.top + after!.height + OUTSIDE
  } else if (after) {
    centre = (after.top + after.height + before.top) / 2
  } else {
    centre = before.top - OUTSIDE
  }
  return {
    left: next.left,
    top: centre - BAR / 2,
    width: next.width,
    height: BAR,
  }
}

/**
 * The meal's dishes with `moving` put at `index` among the others, or null
 * when that's the order they're in already.
 */
export function reorderFor(ids: string[], moving: string, index: number) {
  if (ids.length < 2) return null
  const others = ids.filter((id) => id !== moving)
  const order = [...others.slice(0, index), moving, ...others.slice(index)]
  const unchanged = order.every((id, position) => id === ids[position])
  return unchanged ? null : order
}
