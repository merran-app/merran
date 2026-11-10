import { useDirection } from "@base-ui/react/direction-provider"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import * as React from "react"

import { useIsMobile } from "@/hooks/use-mobile"
import { onIos, standalone } from "@/features/install/install"
import { cn } from "@/lib/utils"

import { useOpenRow } from "./open-row"
import {
  alongLine,
  inEdgeZone,
  lockAxis,
  OPEN_PX,
  pastCommit,
  swipeEnd,
  velocityOf,
  FLICK_WINDOW_MS,
  type Axis,
  type SwipeSide,
} from "./swipe-math"

/** Something a swipe does to a row: one that the row's menu does too. */
export type SwipeAction = {
  label: string
  icon: IconSvgElement
  tone: "destructive" | "primary"
  /** Slides the row off before acting: for actions that take it away. */
  leaves: boolean
  onAction: () => Promise<unknown> | void
}

/** Where a finger went down, and where it's been since, `alongLine`. */
type Gesture = {
  pointerId: number
  x: number
  y: number
  axis: Axis | null
  /** The offset the row had when the finger went down, if it was open. */
  from: number
  /** Where it's been lately, for how fast it's going. */
  samples: { x: number; t: number }[]
  buzzed: boolean
}

const TONES = {
  destructive: "bg-destructive text-white",
  primary: "bg-primary text-primary-foreground",
}

/**
 * A row in a list that swipes on a phone: a short swipe opens it on an
 * action's button, a long one or a flick does the action. Swipe towards the
 * end of the line for `start`, back for `end`: right and left in English,
 * the other way round in a right-to-left language. Scrolling stays the
 * phone's own, and a long press still starts selecting. Anywhere else, and
 * while `enabled` is false, it's the plain row it wraps.
 */
export function SwipeRow({
  start = null,
  end = null,
  enabled,
  className,
  contentClassName,
  children,
  ...props
}: React.ComponentProps<"li"> & {
  /** Shown at the start of the line, on the left in English. */
  start?: SwipeAction | null
  /** Shown at the end of the line, on the right in English. */
  end?: SwipeAction | null
  enabled: boolean
  /** Classes for the sliding content, which used to be the row's <li>. */
  contentClassName?: string
}) {
  const isMobile = useIsMobile()
  const swipes = enabled && isMobile && Boolean(start || end)

  if (!swipes) {
    return (
      <li className={className} {...props}>
        <div className={contentClassName}>{children}</div>
      </li>
    )
  }
  return (
    <Swiping
      start={start}
      end={end}
      className={className}
      contentClassName={contentClassName}
      {...props}
    >
      {children}
    </Swiping>
  )
}

function Swiping({
  start,
  end,
  className,
  contentClassName,
  children,
  ...props
}: React.ComponentProps<"li"> & {
  start: SwipeAction | null
  end: SwipeAction | null
  contentClassName?: string
}) {
  const id = React.useId()
  const { open, setOpen } = useOpenRow(id)
  const [offset, setOffset] = React.useState(0)
  const [dragging, setDragging] = React.useState(false)
  const gesture = React.useRef<Gesture | null>(null)
  /** The last gesture moved sideways, so the click that ends it is swallowed. */
  const swiped = React.useRef(false)
  const content = React.useRef<HTMLDivElement>(null)
  const direction = useDirection()
  /** Where a touch is along the line, so a right-to-left swipe mirrors. */
  const along = (event: React.PointerEvent) =>
    alongLine(event.clientX, window.innerWidth, direction)

  // Another row opened, or a tap elsewhere or a scroll closed this one.
  React.useEffect(() => {
    if (!open && !gesture.current) setOffset(0)
  }, [open])

  // Selecting started under the finger: this row unmounts and remounts as a
  // plain row, so let go of the open row with it.
  React.useEffect(() => () => setOpen(false), [setOpen])

  const width = () => content.current?.offsetWidth ?? window.innerWidth
  const actionFor = (side: SwipeSide) => (side === "start" ? start : end)

  function begin(event: React.PointerEvent) {
    if (event.pointerType === "mouse") return
    // In the installed app on an iPhone, the edge lines start from is for
    // going back.
    if (standalone() && onIos() && inEdgeZone(along(event))) return
    gesture.current = {
      pointerId: event.pointerId,
      x: along(event),
      y: event.clientY,
      axis: null,
      from: offset,
      samples: [{ x: along(event), t: event.timeStamp }],
      buzzed: false,
    }
    swiped.current = false
  }

  function track(event: React.PointerEvent) {
    const now = gesture.current
    if (!now || now.pointerId !== event.pointerId) return
    const dx = along(event) - now.x
    const dy = event.clientY - now.y

    if (now.axis === null) {
      now.axis = lockAxis(dx, dy)
      if (now.axis === "y") {
        // A scroll: the page has it from here.
        gesture.current = null
        return
      }
      if (now.axis === "x") {
        content.current?.setPointerCapture(event.pointerId)
        swiped.current = true
        setDragging(true)
      }
    }
    if (now.axis !== "x") return

    // Only the moves in the last FLICK_WINDOW_MS count towards a flick.
    now.samples = [
      ...now.samples.filter(
        (sample) => event.timeStamp - sample.t <= FLICK_WINDOW_MS
      ),
      { x: along(event), t: event.timeStamp },
    ]
    const next = limit(now.from + dx)
    if (!now.buzzed && pastCommit(next, width()) && actionFor(sideOf(next))) {
      now.buzzed = true
      navigator.vibrate?.(10)
    }
    setOffset(next)
  }

  /** Past a side with no action, the row moves a third as far. */
  function limit(next: number) {
    const max = width()
    const clamped = Math.max(-max, Math.min(max, next))
    return actionFor(sideOf(clamped)) ? clamped : clamped / 3
  }

  function finish(event: React.PointerEvent) {
    const now = gesture.current
    if (!now || now.pointerId !== event.pointerId) return
    gesture.current = null
    setDragging(false)
    if (now.axis !== "x") return

    const result = swipeEnd({
      offset,
      width: width(),
      velocity: velocityOf(now.samples, event.timeStamp),
      has: { start: Boolean(start), end: Boolean(end) },
      // A flick never takes a row away: Remove and Used up need halfway.
      flicks: {
        start: start?.tone !== "destructive",
        end: end?.tone !== "destructive",
      },
    })
    if (result.kind === "commit") {
      void act(result.side)
    } else if (result.kind === "open") {
      setOffset(result.side === "start" ? OPEN_PX : -OPEN_PX)
      setOpen(true)
    } else {
      setOffset(0)
      setOpen(false)
    }
  }

  function cancel() {
    gesture.current = null
    setDragging(false)
    setOffset(open ? offset : 0)
  }

  /**
   * Does a side's action. One that takes the row away slides it off first;
   * either way the row comes back closed once it's done, so a failure
   * leaves it where it was.
   */
  async function act(side: SwipeSide) {
    const action = actionFor(side)
    if (!action) return
    if (!action.leaves) {
      setOffset(0)
      setOpen(false)
      await action.onAction()
      return
    }
    setOffset(side === "start" ? width() : -width())
    try {
      await action.onAction()
    } finally {
      setOffset(0)
      setOpen(false)
    }
  }

  /**
   * The click that ends a swipe isn't a tap on the row, and a tap on an
   * open row closes it rather than opening the thing.
   */
  function swallowClick(event: React.MouseEvent) {
    if (!swiped.current && !open) return
    event.preventDefault()
    event.stopPropagation()
    // The click that ends a swipe only ends it: the row may have just opened.
    if (swiped.current) {
      swiped.current = false
      return
    }
    setOffset(0)
    setOpen(false)
  }

  const shown = offset === 0 ? null : actionFor(sideOf(offset))
  const side = sideOf(offset)

  return (
    <li
      data-swipe-row={id}
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      {/*
        The action fills only the gap the swipe opens, so the row itself
        needs no background of its own and looks the same on any card.
      */}
      {shown && (
        <div
          aria-hidden
          style={{ width: Math.abs(offset) }}
          className={cn(
            "absolute inset-y-0 flex overflow-hidden",
            side === "start" ? "start-0 justify-start" : "end-0 justify-end",
            !dragging && "transition-[width] duration-200 ease-out",
            TONES[shown.tone]
          )}
        >
          <button
            type="button"
            tabIndex={-1}
            onClick={() => void act(side)}
            style={{ minWidth: OPEN_PX }}
            className="flex w-full shrink-0 flex-col items-center justify-center gap-1 text-xs font-medium"
          >
            <HugeiconsIcon
              icon={shown.icon}
              strokeWidth={2}
              className="size-5"
            />
            {shown.label}
          </button>
        </div>
      )}
      <div
        ref={content}
        onPointerDown={begin}
        onPointerMove={track}
        onPointerUp={finish}
        onPointerCancel={cancel}
        onClickCapture={swallowClick}
        style={{
          transform: offset
            ? `translateX(${direction === "rtl" ? -offset : offset}px)`
            : undefined,
        }}
        className={cn(
          // Scrolling and zooming stay the phone's own; sideways is ours.
          "relative touch-pan-y touch-pinch-zoom",
          !dragging && "transition-transform duration-200 ease-out",
          contentClassName
        )}
      >
        {children}
      </div>
    </li>
  )
}

function sideOf(offset: number): SwipeSide {
  return offset > 0 ? "start" : "end"
}
