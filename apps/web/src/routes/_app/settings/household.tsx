import { Home01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { meQuery } from "@/features/auth/queries"
import { useActiveHousehold, useMe } from "@/features/auth/use-me"
import { HouseholdAiCard } from "@/features/ai/household-ai-card"
import { householdAiQuery } from "@/features/ai/queries"
import { AutoplanCard } from "@/features/household/autoplan-card"
import { DetailsCard } from "@/features/household/details-card"
import { InvitesCard } from "@/features/household/invites-card"
import { MembersCard } from "@/features/household/members-card"
import { NutritionLibraryCard } from "@/features/household/nutrition-library-card"
import { PhotosCard } from "@/features/household/photos-card"
import { NewHouseholdCard } from "@/features/household/new-household-card"
import { PlanningCard } from "@/features/household/planning-card"
import { StoresCard } from "@/features/stores/stores-card"
import { YourStoresCard } from "@/features/stores/your-stores-card"
import {
  householdQuery,
  invitesQuery,
  isAdminRole,
  membersQuery,
  tastesQuery,
  themesQuery,
} from "@/features/household/queries"
import { TastesCard } from "@/features/household/tastes-card"
import { ThemeNightsCard } from "@/features/household/theme-nights-card"
import { autoplanQuery } from "@/features/plan/queries"
import { SettingsPage } from "@/features/settings/settings-page"

/** How linking a Kroger account went, when Kroger sends someone back. */
type HouseholdSearch = {
  kroger?: "linked" | "cancelled" | "failed"
  reason?: string
}

export const Route = createFileRoute("/_app/settings/household")({
  validateSearch: (search: Record<string, unknown>): HouseholdSearch => ({
    kroger:
      search.kroger === "linked" ||
      search.kroger === "cancelled" ||
      search.kroger === "failed"
        ? search.kroger
        : undefined,
    reason: typeof search.reason === "string" ? search.reason : undefined,
  }),
  loader: async ({ context: { queryClient } }) => {
    const me = await queryClient.ensureQueryData(meQuery)
    const active = me?.households.find((h) => h.id === me.activeHouseholdId)
    if (!active) return
    await Promise.all([
      queryClient.ensureQueryData(householdQuery),
      queryClient.ensureQueryData(membersQuery),
      queryClient.ensureQueryData(tastesQuery),
      isAdminRole(active.role) && queryClient.ensureQueryData(themesQuery),
      isAdminRole(active.role) && queryClient.ensureQueryData(autoplanQuery),
      isAdminRole(active.role) && queryClient.ensureQueryData(householdAiQuery),
      isAdminRole(active.role) && queryClient.ensureQueryData(invitesQuery),
    ])
  },
  component: HouseholdSettings,
})

function HouseholdSettings() {
  const { t } = useTranslation()
  const me = useMe()
  const household = useActiveHousehold()
  const canManage = isAdminRole(household?.role)

  return (
    <>
      {household ? (
        <SettingsPage
          groups={[
            {
              id: "household-details",
              title: t("settings.household.groups.details.title"),
              description: t("settings.household.groups.details.description"),
              content: <DetailsCard />,
            },
            {
              id: "people-and-households",
              title: t("settings.household.groups.people.title"),
              description: t("settings.household.groups.people.description"),
              content: (
                <>
                  <MembersCard />
                  {canManage && <InvitesCard />}
                  {me.serverAdmin && <NewHouseholdCard />}
                </>
              ),
            },
            {
              id: "meal-planning",
              title: t("settings.household.groups.planning.title"),
              description: t("settings.household.groups.planning.description"),
              content: (
                <>
                  {canManage && <PlanningCard />}
                  <TastesCard />
                  {canManage && <ThemeNightsCard />}
                  {canManage && <AutoplanCard />}
                </>
              ),
            },
            ...(canManage
              ? [
                  {
                    id: "recipes-and-ai",
                    title: t("settings.household.groups.recipes.title"),
                    description: t(
                      "settings.household.groups.recipes.description"
                    ),
                    content: (
                      <>
                        <HouseholdAiCard />
                        <NutritionLibraryCard />
                        <PhotosCard />
                      </>
                    ),
                  },
                  {
                    id: "shopping-and-stores",
                    title: t("settings.household.groups.shopping.title"),
                    description: t(
                      "settings.household.groups.shopping.description"
                    ),
                    content: (
                      <>
                        <YourStoresCard />
                        <StoresCard />
                      </>
                    ),
                  },
                ]
              : []),
          ]}
        />
      ) : (
        <Empty className="rounded-3xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Home01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t("settings.household.none")}</EmptyTitle>
            <EmptyDescription>
              {t("settings.household.noneHint")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {!household && me.serverAdmin && <NewHouseholdCard />}
    </>
  )
}
