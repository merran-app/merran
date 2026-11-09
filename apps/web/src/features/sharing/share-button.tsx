import { Share08Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { householdQuery } from "@/features/household/queries"

import { recipeShareQuery } from "./queries"
import { ShareDialog } from "./share-dialog"
import { useOfferRecipeLink } from "./use-offer-link"

/**
 * Share, on a recipe's page. With no link yet, one tap makes it and offers
 * it; with one, the tap opens the dialog. Not there while the household
 * has recipe sharing off.
 */
export function ShareButton({
  recipe,
}: {
  recipe: { slug: string; name: string }
}) {
  const { t } = useTranslation()
  const { data: household } = useQuery(householdQuery)
  const { data: status } = useQuery(recipeShareQuery(recipe.slug))
  const { makeAndOffer, making } = useOfferRecipeLink(recipe)
  const [dialogOpen, setDialogOpen] = React.useState(false)

  if (!household?.recipeSharing) return null

  async function onShare() {
    if (status?.share) {
      setDialogOpen(true)
      return
    }
    if ((await makeAndOffer()) === "needsDialog") setDialogOpen(true)
  }

  return (
    <>
      {/* An icon beside Edit and ⋯, so the page's actions fit on one row. */}
      <Button
        size="icon-lg"
        variant="outline"
        aria-label={t("sharing.share")}
        title={t("sharing.share")}
        disabled={making}
        onClick={() => void onShare()}
      >
        {making ? (
          <Spinner />
        ) : (
          <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
        )}
      </Button>
      {dialogOpen && (
        <ShareDialog
          recipe={recipe}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </>
  )
}
