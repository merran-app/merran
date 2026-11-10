import { createFileRoute } from "@tanstack/react-router"

import { NutritionLibraryCard } from "@/features/household/nutrition-library-card"
import { PhotosCard } from "@/features/household/photos-card"
import { householdQuery } from "@/features/household/queries"
import { SharingCard } from "@/features/household/sharing-card"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"

/** Settings → Recipes, the household's half: nutrition, photos and links across its library. */
export const Route = createFileRoute("/_app/settings/recipes/")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "recipes", "household"),
  loader: ({ context }) => context.queryClient.ensureQueryData(householdQuery),
  component: RecipesSettings,
})

function RecipesSettings() {
  return (
    <TopicPage page="recipes" half="household">
      <NutritionLibraryCard />
      <PhotosCard />
      <SharingCard />
    </TopicPage>
  )
}
