import { createFileRoute } from "@tanstack/react-router"

import { PasskeysCard } from "@/features/account/passkeys-card"
import { PasswordCard } from "@/features/account/password-card"
import { SsoCard } from "@/features/account/sso-card"
import { TwoFactorCard } from "@/features/account/two-factor-card"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"

/** Settings → Sign-in, your half: your own ways to sign in. */
export const Route = createFileRoute("/_app/settings/sign-in/")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "signIn", "you"),
  component: SignInSettings,
})

function SignInSettings() {
  return (
    <TopicPage page="signIn" half="you">
      <PasswordCard />
      <PasskeysCard />
      <TwoFactorCard />
      <SsoCard />
    </TopicPage>
  )
}
