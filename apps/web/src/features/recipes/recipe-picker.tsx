import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useInfiniteQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { ShowMoreButton } from "@/components/show-more-button"
import { Badge } from "@/components/ui/badge"
import { usePlannedRecipes } from "@/features/plan/use-planned-recipes"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { type Schemas } from "@/lib/api/client"
import { uniqueById } from "@/lib/pages"
import { cn } from "@/lib/utils"

import { formatMinutes } from "./format"
import { pickRecipesQuery } from "./queries"

type RecipeSummary = Schemas["RecipeSummary"]

/**
 * One recipe to pick, found by name on the server as it's typed: for
 * putting a meal on the plan, or picking its side.
 */
export function RecipePicker({
  onPick,
  exclude = [],
  label,
  planDate,
}: {
  onPick: (recipe: RecipeSummary) => void
  exclude?: readonly string[]
  /** What the search box is for. */
  label: string
  /** A day in the week this meal will join. */
  planDate: string | null
}) {
  const { t } = useTranslation()
  const planned = usePlannedRecipes(planDate)
  const [words, setWords] = React.useState("")
  const [find, setFind] = React.useState("")

  // Looks a moment after typing stops, not on every key.
  React.useEffect(() => {
    const timer = setTimeout(() => setFind(words.trim()), 250)
    return () => clearTimeout(timer)
  }, [words])

  const found = useInfiniteQuery(pickRecipesQuery("pick-one", find, null))
  const shown = uniqueById(
    (found.data?.pages ?? []).flatMap((page) => page.recipes)
  ).filter((recipe) => !exclude.includes(recipe.id))

  return (
    <div className="grid min-w-0 gap-3">
      <InputGroup>
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
        </InputGroupAddon>
        <InputGroupInput
          autoFocus
          placeholder={label}
          aria-label={label}
          value={words}
          onChange={(event) => setWords(event.target.value)}
        />
      </InputGroup>
      {found.isPending ? (
        <Skeleton className="h-48" />
      ) : shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t("plan.pick.none")}
        </p>
      ) : (
        <ul
          aria-busy={found.isPlaceholderData}
          className={cn(
            "grid max-h-72 divide-y overflow-x-hidden overflow-y-auto rounded-xl border transition-opacity",
            found.isPlaceholderData && "opacity-60"
          )}
        >
          {shown.map((recipe) => (
            <li key={recipe.id}>
              <button
                type="button"
                className="flex w-full min-w-0 items-center gap-3 px-3 py-2 text-start hover:bg-secondary/50"
                onClick={() => onPick(recipe)}
              >
                {recipe.photo ? (
                  <img
                    decoding="async"
                    src={recipe.photo.thumb}
                    alt=""
                    className="size-9 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span className="size-9 shrink-0 rounded-lg bg-secondary" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{recipe.name}</span>
                  {planned.has(recipe.id) && (
                    <Badge variant="secondary">
                      {t("plan.alreadyPlanned")}
                    </Badge>
                  )}
                </span>
                {recipe.totalMinutes != null && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatMinutes(t, recipe.totalMinutes)}
                  </span>
                )}
              </button>
            </li>
          ))}
          {found.hasNextPage && (
            <li className="flex justify-center p-2">
              <ShowMoreButton query={found} />
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
