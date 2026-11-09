import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ApiError } from "@/lib/api/client"

import { needsFreshTap, offerLink } from "./offer-link"
import { useShareRecipe } from "./queries"

type Recipe = { slug: string; name: string }

/**
 * Offering a recipe's link to someone: through the share sheet where the
 * device has one, otherwise by copying. Each tells the person how it went.
 */
export function useOfferRecipeLink(recipe: Recipe) {
  const { t } = useTranslation()
  const makeLink = useShareRecipe(recipe.slug)

  /** "retry" means Safari wants a fresh tap before it opens the share sheet. */
  async function offer(url: string): Promise<"done" | "retry"> {
    try {
      const outcome = await offerLink({
        title: recipe.name,
        text: t("sharing.offerText"),
        url,
      })
      if (outcome === "copied") toast.success(t("sharing.linkCopied"))
      return "done"
    } catch (err) {
      if (needsFreshTap(err)) return "retry"
      toast.error(t("sharing.copyFailed"))
      return "done"
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t("sharing.linkCopied"))
    } catch {
      toast.error(t("sharing.copyFailed"))
    }
  }

  /**
   * Makes the recipe's link if it has none, and offers it. "needsDialog"
   * means the link couldn't be offered from this tap, so the dialog should
   * open: the server has no public address to show it with, or Safari wants
   * a fresh tap for the share sheet.
   */
  async function makeAndOffer(): Promise<"done" | "needsDialog"> {
    try {
      const share = await makeLink.mutateAsync()
      if (!share.url) return "needsDialog"
      return (await offer(share.url)) === "retry" ? "needsDialog" : "done"
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      return "done"
    }
  }

  return { offer, copy, makeAndOffer, making: makeLink.isPending }
}
