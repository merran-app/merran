import * as React from "react"
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu"
import { cn } from "cn"

import { useLongPress, type PressPoint } from "@/hooks/use-long-press"

/*
 * A context menu shares its items with the dropdown menu: Base UI builds both
 * from the same Menu parts, so the "⋯" button and a right click can show the
 * very same items.
 */
export {
  DropdownMenuGroup as ContextMenuGroup,
  DropdownMenuItem as ContextMenuItem,
  DropdownMenuLabel as ContextMenuLabel,
  DropdownMenuSeparator as ContextMenuSeparator,
} from "./dropdown-menu"

type RootProps = Omit<ContextMenuPrimitive.Root.Props, "open" | "defaultOpen">
type TriggerProps = ContextMenuPrimitive.Trigger.Props

/** The event a trigger's handler gets, which can skip Base UI's own handler. */
type TriggerEvent<K extends keyof TriggerProps> = Parameters<
  NonNullable<TriggerProps[K]>
>[0]

/** Opening the menu from a long press, at the finger. */
type TouchOpening = {
  openAt: (point: PressPoint) => void
  /** Where a long press opened it; a right click leaves it to Base UI. */
  point: PressPoint | null
}

const TouchOpeningContext = React.createContext<TouchOpening | null>(null)

/**
 * A menu of what can be done to one thing: a right click opens it, and on a
 * touch screen, a long press.
 *
 * Base UI does long presses itself, but it stops the touch going any further
 * up the page, which would leave pull to refresh and the edge swipe back
 * without it. So the long press is ours, and it opens the menu here.
 */
function ContextMenu({ onOpenChange, ...props }: RootProps) {
  const [open, setOpen] = React.useState(false)
  const [point, setPoint] = React.useState<PressPoint | null>(null)

  const changeOpen: NonNullable<RootProps["onOpenChange"]> = (
    next,
    details
  ) => {
    // A right click opens it where Base UI says.
    if (next) setPoint(null)
    setOpen(next)
    onOpenChange?.(next, details)
  }

  const touchOpening = React.useMemo<TouchOpening>(
    () => ({
      point,
      openAt(at) {
        setPoint(at)
        setOpen(true)
      },
    }),
    [point]
  )

  return (
    <TouchOpeningContext.Provider value={touchOpening}>
      <ContextMenuPrimitive.Root
        data-slot="context-menu"
        open={open}
        onOpenChange={changeOpen}
        {...props}
      />
    </TouchOpeningContext.Provider>
  )
}

/**
 * The area a right click, or a long press on a touch screen, opens the menu
 * on. Base UI's own touch handling is skipped for ours.
 */
function ContextMenuTrigger({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  onContextMenu,
  onClickCapture,
  onTouchStart,
  ...props
}: TriggerProps) {
  const touchOpening = React.useContext(TouchOpeningContext)
  const press = useLongPress((point) => touchOpening?.openAt(point))
  const touch = React.useRef(false)

  function pointerDown(event: TriggerEvent<"onPointerDown">) {
    touch.current = event.pointerType === "touch"
    press.onPointerDown(event)
    onPointerDown?.(event)
  }

  function pointerMove(event: TriggerEvent<"onPointerMove">) {
    press.onPointerMove(event)
    onPointerMove?.(event)
  }

  function pointerUp(event: TriggerEvent<"onPointerUp">) {
    press.onPointerUp()
    onPointerUp?.(event)
  }

  function pointerCancel(event: TriggerEvent<"onPointerCancel">) {
    press.onPointerCancel()
    onPointerCancel?.(event)
  }

  function lostPointerCapture(event: TriggerEvent<"onLostPointerCapture">) {
    press.onLostPointerCapture()
    onLostPointerCapture?.(event)
  }

  function rightClick(event: TriggerEvent<"onContextMenu">) {
    // Android ends a long press with a context menu event, too: the long
    // press has opened the menu already.
    if (touch.current) {
      event.preventBaseUIHandler()
      press.onContextMenu(event)
    }
    onContextMenu?.(event)
  }

  function clickCapture(event: TriggerEvent<"onClickCapture">) {
    press.onClickCapture(event)
    onClickCapture?.(event)
  }

  function touchStart(event: TriggerEvent<"onTouchStart">) {
    touch.current = true
    event.preventBaseUIHandler()
    onTouchStart?.(event)
  }

  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerCancel}
      onLostPointerCapture={lostPointerCapture}
      onContextMenu={rightClick}
      onClickCapture={clickCapture}
      onTouchStart={touchStart}
      {...props}
    />
  )
}

/** A long press opens it at the finger, just clear of the fingertip. */
function anchorAt(point: PressPoint) {
  return {
    getBoundingClientRect: () =>
      DOMRect.fromRect({ x: point.x, y: point.y, width: 10, height: 10 }),
  }
}

function ContextMenuContent({
  className,
  ...props
}: ContextMenuPrimitive.Popup.Props) {
  const touchOpening = React.useContext(TouchOpeningContext)
  const point = touchOpening?.point
  const anchor = React.useMemo(
    () => (point ? anchorAt(point) : undefined),
    [point]
  )

  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align="start"
        side="bottom"
        anchor={anchor}
      >
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-content"
          className={cn(
            "z-50 max-h-(--available-height) min-w-48 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-2xl bg-popover p-1 text-popover-foreground shadow-2xl ring-1 ring-foreground/5 duration-100 outline-none dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  )
}

export { ContextMenu, ContextMenuContent, ContextMenuTrigger }
