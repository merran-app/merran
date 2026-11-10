import { CookBookIcon, Delete02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { DeleteRecipesDialog } from "@/features/recipes/bulk-dialogs"
import { ApiError } from "@/lib/api/client"
import { formatDate } from "@/lib/format"

import {
  useDismissDuplicate,
  type DuplicatePair,
  type RecipeDuplicate,
} from "./queries"

/** A link's host without "www.", or null when there's no link to show. */
function hostOf(link: string | null) {
  if (!link) return null
  try {
    return new URL(link).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

/** One side of a pair: its photo, name, where it's from and when it was added. */
function PairSide({
  recipe,
  onDelete,
}: {
  recipe: RecipeDuplicate
  onDelete: () => void
}) {
  const { t, i18n } = useTranslation()
  const host = hostOf(recipe.sourceUrl)
  return (
    <div className="grid content-start gap-3">
      <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted">
        {recipe.photo ? (
          <img
            src={recipe.photo}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground/40">
            <HugeiconsIcon
              icon={CookBookIcon}
              strokeWidth={1.5}
              className="size-12"
            />
          </div>
        )}
      </div>
      <div className="grid gap-0.5">
        <p className="font-medium">{recipe.name}</p>
        <p className="text-sm text-muted-foreground">
          {host && <>{host} · </>}
          {t("recipes.duplicates.added", {
            date: formatDate(recipe.createdAt, i18n.language),
          })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          render={<Link to="/recipes/$slug" params={{ slug: recipe.slug }} />}
        >
          {t("recipes.duplicates.openRecipe")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          {t("recipes.delete")}
        </Button>
      </div>
    </div>
  )
}

/**
 * Two recipes that may be the same one, side by side (stacked on a
 * phone), with why, Open and Delete for each, and Not the same.
 */
export function DuplicatePairCard({
  pair,
}: {
  /** The two recipes, the older first, as the list gives them. */
  pair: Pick<DuplicatePair, "reasons"> & {
    recipes: readonly RecipeDuplicate[]
  }
}) {
  const { t } = useTranslation()
  const dismiss = useDismissDuplicate()
  const [deleting, setDeleting] = React.useState<RecipeDuplicate | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [older, newer] = pair.recipes
  if (!older || !newer) return null

  async function notTheSame(first: string, second: string) {
    setBusy(true)
    try {
      await dismiss(first, second)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-sm text-muted-foreground">
          {pair.reasons
            .map((reason) => t(`recipes.duplicates.reasons.${reason}`))
            .join(", ")}
        </p>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <PairSide recipe={older} onDelete={() => setDeleting(older)} />
        <PairSide recipe={newer} onDelete={() => setDeleting(newer)} />
      </CardContent>
      <CardFooter>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void notTheSame(older.id, newer.id)}
        >
          {t("recipes.duplicates.notSame")}
        </Button>
      </CardFooter>
      {deleting && (
        <DeleteRecipesDialog
          recipes={[deleting]}
          open
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          onDeleted={() => setDeleting(null)}
        />
      )}
    </Card>
  )
}
