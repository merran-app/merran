import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { householdQuery } from "@/features/household/queries"

import { recipeShareQuery } from "./queries"

/**
 * Marks a recipe that has a link out, so nobody forgets it's open to anyone.
 * Not there while the household has recipe sharing off, as with Share.
 */
export function SharedBadge({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const { data: household } = useQuery(householdQuery)
  const { data } = useQuery(recipeShareQuery(slug))

  if (!household?.recipeSharing) return null
  if (!data?.share) return null
  return <Badge variant="secondary">{t("sharing.shared")}</Badge>
}
