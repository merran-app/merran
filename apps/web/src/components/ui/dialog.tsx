import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { useIsMobile } from "@/hooks/use-mobile"

const MobileDialog = React.createContext(false)

type DialogRootProps = Omit<DialogPrimitive.Root.Props, "onOpenChange"> & {
  onOpenChange?: (open: boolean) => void
}

function useMobileDialog() {
  return React.useContext(MobileDialog)
}

function Dialog({ handle, ...props }: DialogRootProps) {
  const mobile = useIsMobile()

  return (
    <MobileDialog.Provider value={mobile}>
      {mobile ? (
        <Drawer data-slot="dialog" {...props} />
      ) : (
        <DialogPrimitive.Root data-slot="dialog" handle={handle} {...props} />
      )}
    </MobileDialog.Provider>
  )
}

function DialogTrigger({ handle, ...props }: DialogPrimitive.Trigger.Props) {
  if (useMobileDialog()) {
    return <DrawerTrigger data-slot="dialog-trigger" {...props} />
  }

  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      handle={handle}
      {...props}
    />
  )
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  if (useMobileDialog()) {
    return <DrawerClose data-slot="dialog-close" {...props} />
  }

  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/80 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  const mobile = useMobileDialog()

  if (mobile) {
    const mobileProps = props as React.ComponentProps<"div">

    return (
      <DrawerContent className="relative max-h-[92svh] min-h-0">
        <div
          data-slot="dialog-content"
          className={cn(
            "grid min-h-0 gap-6 overflow-y-auto overscroll-contain px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]",
            className
          )}
          {...mobileProps}
        >
          {children}
        </div>
        {showCloseButton && (
          <DrawerClose
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-7 right-4"
                size="icon-sm"
              />
            }
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            <span className="sr-only">Close</span>
          </DrawerClose>
        )}
      </DrawerContent>
    )
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-4xl bg-popover p-6 text-sm text-popover-foreground ring-1 ring-foreground/5 duration-100 outline-none sm:max-w-md data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-4 right-4"
                size="icon-sm"
              />
            }
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  const mobile = useMobileDialog()

  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", mobile && "pr-10", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  const mobile = useMobileDialog()

  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton &&
        (mobile ? (
          <DrawerClose render={<Button variant="outline" />}>Close</DrawerClose>
        ) : (
          <DialogPrimitive.Close render={<Button variant="outline" />}>
            Close
          </DialogPrimitive.Close>
        ))}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  if (useMobileDialog()) {
    return (
      <DrawerTitle
        data-slot="dialog-title"
        className={cn("leading-none", className)}
        {...props}
      />
    )
  }

  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  if (useMobileDialog()) {
    return (
      <DrawerDescription
        data-slot="dialog-description"
        className={cn(
          "*:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
          className
        )}
        {...props}
      />
    )
  }

  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
