import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTranslation } from "react-i18next"
import * as React from "react"

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
import { KrogerBasketPage } from "./kroger-basket-page"
import { WalmartBasketPage } from "./walmart-basket-page"
import type { SendPlan } from "./queries"
import { ReviewFinderContext, type ReviewFinder } from "./review-finder"
import { cn } from "@/lib/utils"

export type ShoppingReviewSelection = { store: string; items: string[] }

/** Match the assistant's phone drawer, with one scrolling body and reachable controls. */
export function ShoppingReview({
  plan,
  review,
  onClose,
}: {
  plan: SendPlan
  review: ShoppingReviewSelection | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const phone = useIsMobile()
  const [finder, setFinder] = React.useState<ReviewFinder | null>(null)
  const [target, setTarget] = React.useState<HTMLDivElement | null>(null)
  const finderSlot = React.useMemo(
    () => ({ target, show: setFinder }),
    [target]
  )
  const returnFocus = React.useRef<HTMLElement | null>(null)
  React.useLayoutEffect(() => {
    if (finder) {
      if (!returnFocus.current) returnFocus.current = finder.returnFocus
      target?.querySelector("input")?.focus()
    } else if (returnFocus.current) {
      returnFocus.current.focus()
      returnFocus.current = null
    }
  }, [finder?.title, target])
  const Title = phone ? DrawerTitle : DialogTitle
  const Description = phone ? DrawerDescription : DialogDescription
  const store = plan.stores.find((store) => store.key === review?.store)
  const changed =
    review &&
    plan.items.some(
      (item) =>
        review.items.includes(item.itemId) &&
        item.deliveries.some(
          (sent) => sent.store === review.store && sent.changed
        )
    )
  const body = (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-6">
        <Title className="min-w-0 flex-1 truncate text-base font-semibold">
          {finder?.title ??
            t("list.shopping.review", { store: store?.name ?? "" })}
        </Title>
        <Description className="sr-only">
          {finder?.description ?? t("list.shopping.reviewHint")}
        </Description>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t(
            finder ? "stores.basket.backToReview" : "list.shopping.back"
          )}
          onClick={finder?.back ?? onClose}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 [&_h1]:text-2xl",
          finder && "hidden"
        )}
      >
        <p className="mb-4 text-sm text-muted-foreground">
          {t("list.shopping.reviewHint")}
        </p>
        {changed && (
          <div
            role="status"
            className="mb-4 grid justify-items-start gap-2 rounded-2xl border p-4 text-sm"
          >
            <p>{t("list.shopping.changedHint")}</p>
            <Button
              variant="outline"
              size="sm"
              render={
                <a
                  href={store?.cartUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              {t("stores.basket.openCart")}
            </Button>
          </div>
        )}
        {review &&
          (review.store === "kroger" ? (
            <KrogerBasketPage items={review.items} embedded />
          ) : (
            <WalmartBasketPage items={review.items} embedded />
          ))}
      </div>
      {!phone && (
        <div
          ref={setTarget}
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-4",
            finder ? "flex" : "hidden"
          )}
        />
      )}
      <div className="shrink-0 border-t px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-6">
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={finder?.back ?? onClose}
        >
          {t(finder ? "stores.basket.backToReview" : "list.shopping.back")}
        </Button>
      </div>
    </>
  )
  const onOpenChange = (open: boolean) => {
    if (!open) (finder?.back ?? onClose)()
  }
  if (phone)
    return (
      <Drawer open={Boolean(review)} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[92svh] min-h-0 overflow-hidden">
          {body}
        </DrawerContent>
      </Drawer>
    )
  return (
    <Dialog open={Boolean(review)} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[90dvh] min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
      >
        <ReviewFinderContext.Provider value={finderSlot}>
          {body}
        </ReviewFinderContext.Provider>
      </DialogContent>
    </Dialog>
  )
}
