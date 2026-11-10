import { ArrowLeft01Icon, Copy01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty"
import { DuplicatePairCard } from "@/features/recipes/duplicates/pair-card"
import { duplicatePairsQuery } from "@/features/recipes/duplicates/queries"

export const Route = createFileRoute("/_app/recipes/duplicates")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(duplicatePairsQuery),
  component: PossibleDuplicates,
})

/** Recipes → Possible duplicates: every pair that may be the same recipe. */
function PossibleDuplicates() {
  const { t } = useTranslation()
  const { data: pairs } = useSuspenseQuery(duplicatePairsQuery)
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="-ms-3 mt-2 md:mt-4"
        render={<Link to="/recipes" />}
      >
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          strokeWidth={2}
          className="rtl:-scale-x-100"
        />
        {t("nav.recipes")}
      </Button>
      <PageHeader
        title={t("recipes.duplicates.title")}
        description={t("recipes.duplicates.description")}
      />
      {pairs.length === 0 ? (
        <Empty className="rounded-3xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyDescription>{t("recipes.duplicates.empty")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4">
          {pairs.map((pair) => (
            <DuplicatePairCard
              key={pair.recipes.map((recipe) => recipe.id).join(":")}
              pair={pair}
            />
          ))}
        </div>
      )}
    </>
  )
}
