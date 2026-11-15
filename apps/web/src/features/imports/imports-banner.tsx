import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useRefreshRecipes } from "@/features/recipes/queries"

import { useImportTitle, useSummaryText } from "./imports-list"
import { importsQuery, isGoing } from "./queries"

/**
 * On Recipes, while an import is going: how far it's got, and the way to
 * its page. When it's finished, its recipes show.
 */
export function ImportsBanner() {
  const { t } = useTranslation()
  const refreshRecipes = useRefreshRecipes()
  const titleOf = useImportTitle()
  const summaryOf = useSummaryText()
  const { data } = useQuery(importsQuery)
  const going = (data?.imports ?? []).filter(isGoing)

  const ids = going.map((found) => found.id).join(",")
  const before = React.useRef(ids)
  React.useEffect(() => {
    if (before.current && before.current !== ids) void refreshRecipes()
    before.current = ids
  }, [ids, refreshRecipes])

  const latest = going[0]
  if (!latest) return null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
      <Spinner />
      <span className="min-w-0 flex-1" aria-live="polite">
        {titleOf(latest).title}: {summaryOf(latest)}
      </span>
      <Button
        variant="outline"
        size="sm"
        render={
          <Link
            to="/recipes/imports/$importId"
            params={{ importId: latest.id }}
          />
        }
      >
        {t("recipes.links.see")}
      </Button>
    </div>
  )
}
