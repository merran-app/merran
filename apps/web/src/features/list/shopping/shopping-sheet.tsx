import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer"
import { useIsMobile } from "@/hooks/use-mobile"

export function ShoppingSheet({
  title,
  description,
  children,
  onClose,
  busy = false,
}: {
  title: string
  description: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
}) {
  const { t } = useTranslation()
  const phone = useIsMobile()
  const header = (
    <header className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
      <div className="grid min-w-0 gap-1">
        {phone ? (
          <>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </>
        ) : (
          <>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </>
        )}
      </div>
      <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
        {t("shopping.close")}
      </Button>
    </header>
  )
  const body = <div className="min-h-0 overflow-y-auto p-4">{children}</div>
  const onOpenChange = (open: boolean) => {
    if (!open && !busy) onClose()
  }
  return phone ? (
    <Drawer open onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        {header}
        {body}
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        {header}
        {body}
      </DialogContent>
    </Dialog>
  )
}
