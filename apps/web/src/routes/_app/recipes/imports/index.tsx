import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ImportsList } from "@/features/imports/imports-list"
import { importsQuery } from "@/features/imports/queries"

/** Every import of the last 90 days: Recipes → ⋯ → Imports. */
export const Route = createFileRoute("/_app/recipes/imports/")({
  component: ImportsRoute,
})

function ImportsRoute() {
  const { t } = useTranslation()
  const { data } = useQuery(importsQuery)
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
        title={t("imports.title")}
        description={t("imports.description")}
      />
      {data ? (
        <ImportsList imports={data.imports} />
      ) : (
        <Skeleton className="h-60 rounded-3xl" />
      )}
    </>
  )
}
