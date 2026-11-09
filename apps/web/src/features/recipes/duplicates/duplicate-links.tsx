import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"

import { useDismissDuplicate, type RecipeDuplicate } from "./queries"

/**
 * A recipe's possible duplicates, each with why it matched, a way to open
 * it, and "Not the same" to stop it showing again.
 */
export function DuplicateLinks({
  recipe,
  duplicates,
}: {
  /** The recipe they may be duplicates of, by its id. */
  recipe: string
  duplicates: readonly RecipeDuplicate[]
}) {
  const { t } = useTranslation()
  const dismiss = useDismissDuplicate()
  const [busy, setBusy] = React.useState<string | null>(null)

  async function notTheSame(other: RecipeDuplicate) {
    setBusy(other.id)
    try {
      await dismiss(recipe, other.id)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <ul className="grid gap-2">
      {duplicates.map((other) => (
        <li
          key={other.id}
          className="flex flex-wrap items-center justify-between gap-2"
        >
          <span className="min-w-0">
            <span className="font-medium">{other.name}</span>{" "}
            <span className="text-muted-foreground">
              ·{" "}
              {other.reasons
                .map((reason) => t(`recipes.duplicates.reasons.${reason}`))
                .join(", ")}
            </span>
          </span>
          <span className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              render={
                <Link to="/recipes/$slug" params={{ slug: other.slug }} />
              }
            >
              {t("recipes.duplicates.open")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy === other.id}
              onClick={() => void notTheSame(other)}
            >
              {t("recipes.duplicates.notSame")}
            </Button>
          </span>
        </li>
      ))}
    </ul>
  )
}
