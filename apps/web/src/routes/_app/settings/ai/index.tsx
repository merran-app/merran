import { createFileRoute } from "@tanstack/react-router"

import { HouseholdAiKeysCard } from "@/features/ai/household/keys-card"
import { HouseholdAiModelsCard } from "@/features/ai/household/models-card"
import { HouseholdAiSpendCard } from "@/features/ai/household/spend-card"
import { householdAiQuery } from "@/features/ai/queries"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"

/** Settings → AI, the household's half: what it's spent, whose keys pay, and which models. */
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
      <HouseholdAiSpendCard />
      <HouseholdAiKeysCard />
      <HouseholdAiModelsCard />
    </TopicPage>
  )
}
