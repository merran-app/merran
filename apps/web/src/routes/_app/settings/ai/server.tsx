import { createFileRoute } from "@tanstack/react-router"

import { serverAiQuery } from "@/features/ai/queries"
import {
  ServerAiKeysCard,
  ServerAiPolicyCard,
  ServerAiSpendCard,
} from "@/features/ai/server-ai-cards"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"

/** Settings → AI → Whole server: the server's keys, who may use them, and what they've spent. */
export const Route = createFileRoute("/_app/settings/ai/server")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "ai", "server"),
  loader: ({ context }) => context.queryClient.ensureQueryData(serverAiQuery),
  component: ServerAiSettings,
})

function ServerAiSettings() {
  return (
    <TopicPage page="ai" half="server">
      <ServerAiKeysCard />
      <ServerAiPolicyCard />
      <ServerAiSpendCard />
    </TopicPage>
  )
}
