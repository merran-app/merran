import { Copy01Icon, Share08Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api/client"

import { recipeShareQuery, useStopSharing } from "./queries"
import { useOfferRecipeLink } from "./use-offer-link"

type Recipe = { slug: string; name: string }

/**
 * A recipe's link, to copy or send on, and the way to end it. A drawer on
 * a phone, as every dialog is.
 */
export function ShareDialog({
  recipe,
  open,
  onOpenChange,
}: {
  recipe: Recipe
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { data: status, isError } = useQuery({
    ...recipeShareQuery(recipe.slug),
    enabled: open,
  })
  const stopSharing = useStopSharing(recipe.slug)
  const { offer, copy, makeAndOffer, making } = useOfferRecipeLink(recipe)
  const share = status?.share ?? null
  const url = share?.url ?? null

  // This tap is a fresh one, so the share sheet is allowed to open. If it
  // still isn't, copying is the next best thing.
  async function sendLink() {
    if (!url) {
      await makeAndOffer()
      return
    }
    if ((await offer(url)) === "retry") await copy(url)
  }

  async function stop() {
    try {
      await stopSharing.mutateAsync()
      toast.success(t("sharing.stop.done"))
      onOpenChange(false)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("sharing.dialog.title", { name: recipe.name })}
          </DialogTitle>
          <DialogDescription>
            {share ? t("sharing.dialog.hint") : t("sharing.dialog.notShared")}
          </DialogDescription>
        </DialogHeader>

        {isError ? (
          <p className="text-sm text-destructive">
            {t("sharing.dialog.loadFailed")}
          </p>
        ) : !status ? (
          <Skeleton className="h-10" />
        ) : share && !url ? (
          <p className="text-sm text-muted-foreground">
            {t("sharing.dialog.noAddress")}
          </p>
        ) : url ? (
          <Input
            readOnly
            value={url}
            aria-label={t("sharing.dialog.linkLabel")}
            onFocus={(event) => event.currentTarget.select()}
          />
        ) : null}

        {status && (
          <DialogFooter>
            {share && (
              <ConfirmDialog
                trigger={
                  <Button variant="outline">{t("sharing.stopSharing")}</Button>
                }
                title={t("sharing.stop.title")}
                description={t("sharing.stop.description")}
                confirm={t("sharing.stopSharing")}
                onConfirm={stop}
              />
            )}
            {url && (
              <Button variant="outline" onClick={() => void copy(url)}>
                <HugeiconsIcon
                  icon={Copy01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("sharing.copyLink")}
              </Button>
            )}
            {(url || !share) && (
              <Button disabled={making} onClick={() => void sendLink()}>
                {making ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <HugeiconsIcon
                    icon={Share08Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                )}
                {t("sharing.shareEllipsis")}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
