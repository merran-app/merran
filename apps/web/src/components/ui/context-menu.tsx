import * as React from "react"
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu"
import { cn } from "cn"

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

type TriggerProps = ContextMenuPrimitive.Trigger.Props

/** The event a trigger's handler gets, which can skip Base UI's own handler. */
type TriggerEvent<K extends keyof TriggerProps> = Parameters<
  NonNullable<TriggerProps[K]>
>[0]

function ContextMenu({ ...props }: ContextMenuPrimitive.Root.Props) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
}

/**
 * The area a right click opens the menu on. A long press on a touch screen is
 * left alone, because there it starts selecting.
 */
function ContextMenuTrigger({
  onPointerDown,
  onContextMenu,
  onTouchStart,
  ...props
}: TriggerProps) {
  const touch = React.useRef(false)

  function rememberPointer(event: TriggerEvent<"onPointerDown">) {
    touch.current = event.pointerType === "touch"
    onPointerDown?.(event)
  }

  function rightClick(event: TriggerEvent<"onContextMenu">) {
    // Android ends a long press with a context menu event, too.
    if (touch.current) event.preventBaseUIHandler()
    onContextMenu?.(event)
  }

  function touchStart(event: TriggerEvent<"onTouchStart">) {
    touch.current = true
    event.preventBaseUIHandler()
    onTouchStart?.(event)
  }

  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      onPointerDown={rememberPointer}
      onContextMenu={rightClick}
      onTouchStart={touchStart}
      {...props}
    />
  )
}

function ContextMenuContent({
  className,
  ...props
}: ContextMenuPrimitive.Popup.Props) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align="start"
        side="bottom"
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
