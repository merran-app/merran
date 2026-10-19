import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer"
import { useIsMobile } from "@/hooks/use-mobile"

/** Keep recipe review reachable on phones, even with a long list of changes. */
export function ReviewOverlay({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const phone = useIsMobile()

  if (phone) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92svh] min-h-0 overflow-hidden">
          <div className="grid shrink-0 gap-2 border-b px-4 py-4">
            <div className="flex items-start gap-3">
              <DrawerTitle className="min-w-0 flex-1 break-words">
                {title}
              </DrawerTitle>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => onOpenChange(false)}
              >
                {t("recipes.review.close")}
              </Button>
            </div>
            <DrawerDescription>{description}</DrawerDescription>
          </div>
          <div className="grid min-h-0 gap-6 overflow-y-auto overscroll-contain px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
