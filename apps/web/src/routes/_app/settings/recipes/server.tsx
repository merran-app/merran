import { createFileRoute } from "@tanstack/react-router"

import { NutritionCard } from "@/features/server/nutrition-card"
import { PhotosCard } from "@/features/server/photos-card"
import { serverSettingsQuery } from "@/features/server/queries"
import { VoiceCard } from "@/features/server/voice-card"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"

/** Settings → Recipes → Whole server: nutrition data, AI photos and the cooking voice. */
export const Route = createFileRoute("/_app/settings/recipes/server")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "recipes", "server"),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(serverSettingsQuery),
  component: ServerRecipesSettings,
})

function ServerRecipesSettings() {
  return (
    <TopicPage page="recipes" half="server">
      <NutritionCard />
      <PhotosCard />
      <VoiceCard />
    </TopicPage>
  )
}
