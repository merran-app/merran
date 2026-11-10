import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { DuplicateLinks } from "./duplicate-links"
import { isNewRecipe } from "./new-recipe"
import { recipeDuplicatesQuery } from "./queries"

/**
 * On a recipe added in the last 7 days: the recipes the household may
 * already have that are the same one. Nothing for older recipes, whose
 * pairs are on the Possible duplicates page.
 */
export function DuplicatesNote({
  recipe,
}: {
  recipe: { id: string; createdAt: string }
}) {
  const { t } = useTranslation()
  const isNew = isNewRecipe(recipe.createdAt)
  const { data: duplicates } = useQuery({
    ...recipeDuplicatesQuery(recipe.id),
    enabled: isNew,
  })
  if (!isNew || !duplicates?.length) return null
  return (
    <div
      role="status"
      className="grid gap-2 rounded-xl border bg-secondary p-3 text-sm"
    >
      <p>{t("recipes.duplicates.note", { count: duplicates.length })}</p>
      <DuplicateLinks recipe={recipe.id} duplicates={duplicates} />
    </div>
  )
}
