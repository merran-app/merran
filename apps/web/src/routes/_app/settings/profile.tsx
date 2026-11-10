import { createFileRoute } from "@tanstack/react-router"

import { AppearanceCard } from "@/features/account/appearance-card"
import { LanguageCard } from "@/features/account/language-card"
import { MyDataCard } from "@/features/account/my-data-card"
import { ProfileCard } from "@/features/account/profile-card"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"

/** Settings → Profile: how you appear, Merran's language and look, and your data. */
export const Route = createFileRoute("/_app/settings/profile")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "profile", "you"),
  component: ProfileSettings,
})

function ProfileSettings() {
  return (
    <TopicPage page="profile" half="you">
      <ProfileCard />
      <LanguageCard />
      <AppearanceCard />
      <MyDataCard />
    </TopicPage>
  )
}
