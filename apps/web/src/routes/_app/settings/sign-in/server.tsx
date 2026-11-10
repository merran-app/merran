import { createFileRoute } from "@tanstack/react-router"

import { AuthCard } from "@/features/server/auth-card"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"

/** Settings → Sign-in → Whole server: how everyone signs in. */
export const Route = createFileRoute("/_app/settings/sign-in/server")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "signIn", "server"),
  component: ServerSignInSettings,
})

function ServerSignInSettings() {
  return (
    <TopicPage page="signIn" half="server">
      <AuthCard />
    </TopicPage>
  )
}
