import { useQuery } from "@tanstack/react-query"
import type * as React from "react"
import { useTranslation } from "react-i18next"

import { Logo } from "@/components/brand/logo"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"

import type { SharedRecipe } from "./guest-recipe"
import { isTooManyVisits, sharedRecipeQuery } from "./shared-recipe-query"

/** A shared link's whole page when there's no recipe to show, saying why. */
function SharedStatus({ title }: { title: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <Logo showWordmark={false} className="mb-2" />
          <EmptyTitle>{title}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    </div>
  )
}

/**
 * A link that doesn't work: stopped, never made, or its recipe deleted. It
 * says only that, so the link gives nothing away.
 */
export function SharedUnavailable() {
  const { t } = useTranslation()
  return <SharedStatus title={t("sharing.page.unavailable")} />
}

/** The link was opened too often just now. It works again in a minute. */
function SharedTooManyVisits() {
  const { t } = useTranslation()
  return <SharedStatus title={t("sharing.page.tooManyVisits")} />
}

/**
 * The recipe behind a shared link, for the page or cooking it, once it's
 * come; or why it can't be shown.
 */
export function WithSharedRecipe({
  token,
  children,
}: {
  token: string
  children: (shared: SharedRecipe) => React.ReactNode
}) {
  const query = useQuery(sharedRecipeQuery(token))

  if (query.isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-8 text-primary" />
      </div>
    )
  }
  // A recipe already shown stays, even if asking again later fails.
  if (query.data) {
    return children(query.data)
  }
  if (query.isError && isTooManyVisits(query.error)) {
    return <SharedTooManyVisits />
  }
  return <SharedUnavailable />
}
