import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/**
 * Show more, under a list that loads a page at a time: given the infinite
 * query that loads it, it fetches the next page.
 */
export function ShowMoreButton({
  query,
}: {
  query: {
    fetchNextPage: () => Promise<unknown>
    isFetchingNextPage: boolean
    isPlaceholderData: boolean
  }
}) {
  const { t } = useTranslation()

  return (
    <Button
      variant="outline"
      onClick={() => void query.fetchNextPage()}
      // While placeholder data from the previous query is shown, there's no
      // next page of the new one to ask for yet.
      disabled={query.isFetchingNextPage || query.isPlaceholderData}
    >
      {query.isFetchingNextPage && <Spinner />}
      {t("recipes.showMore")}
    </Button>
  )
}
