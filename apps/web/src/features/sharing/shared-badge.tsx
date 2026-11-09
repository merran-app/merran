import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"

import { recipeShareQuery } from "./queries"

/** Marks a recipe that has a link out, so nobody forgets it's open to anyone. */
export function SharedBadge({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const { data } = useQuery(recipeShareQuery(slug))

  if (!data?.share) return null
  return <Badge variant="secondary">{t("sharing.shared")}</Badge>
}
