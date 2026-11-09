import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { DuplicateLinks } from "./duplicate-links"
import { recipeDuplicatesQuery } from "./queries"

/**
 * In Tidy up's Review: the recipe's possible duplicates, read live, so a
 * pair someone dismissed or deleted drops out. Nothing when there are none.
 */
export function PossibleDuplicates({ recipe }: { recipe: string }) {
  const { t } = useTranslation()
  const { data: duplicates } = useQuery(recipeDuplicatesQuery(recipe))
  if (!duplicates?.length) return null
  return (
    <section className="grid gap-2 rounded-xl border p-3 text-sm">
      <h3 className="font-medium">{t("recipes.duplicates.title")}</h3>
      <DuplicateLinks recipe={recipe} duplicates={duplicates} />
    </section>
  )
}
