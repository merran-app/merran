import { createFileRoute } from "@tanstack/react-router"

import { HouseholdAiCard } from "@/features/ai/household-ai-card"
import { householdAiQuery } from "@/features/ai/queries"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"

/** Settings → AI, the household's half: which model each task uses, and whose key pays. */
export const Route = createFileRoute("/_app/settings/ai/")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "ai", "household"),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(householdAiQuery),
  component: AiSettings,
})

function AiSettings() {
  return (
    <TopicPage page="ai" half="household">
      <HouseholdAiCard />
    </TopicPage>
  )
}
