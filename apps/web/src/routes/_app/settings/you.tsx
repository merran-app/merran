import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { ApiKeysCard } from "@/features/account/api-keys-card"
import { AppearanceCard } from "@/features/account/appearance-card"
import { MyDataCard } from "@/features/account/my-data-card"
import { PasswordCard } from "@/features/account/password-card"
import { PasskeysCard } from "@/features/account/passkeys-card"
import { TwoFactorCard } from "@/features/account/two-factor-card"
import { SsoCard } from "@/features/account/sso-card"
import { ConnectedAppsCard } from "@/features/account/connected-apps-card"
import { ProfileCard } from "@/features/account/profile-card"
import { apiKeysQuery } from "@/features/account/queries"
import { InstallCard } from "@/features/install/install-ui"
import { SettingsPage } from "@/features/settings/settings-page"
import { ShareCard } from "@/features/share/share-card"

export const Route = createFileRoute("/_app/settings/you")({
  loader: ({ context }) => context.queryClient.ensureQueryData(apiKeysQuery),
  component: YouSettings,
})

function YouSettings() {
  const { t } = useTranslation()

  return (
    <SettingsPage
      groups={[
        {
          id: "your-profile",
          title: t("settings.you.groups.profile.title"),
          description: t("settings.you.groups.profile.description"),
          content: (
            <>
              <ProfileCard />
              <AppearanceCard />
            </>
          ),
        },
        {
          id: "sign-in-and-security",
          title: t("settings.you.groups.security.title"),
          description: t("settings.you.groups.security.description"),
          content: (
            <>
              <PasswordCard />
              <PasskeysCard />
              <TwoFactorCard />
              <SsoCard />
            </>
          ),
        },
        {
          id: "connected-apps-and-keys",
          title: t("settings.you.groups.connections.title"),
          description: t("settings.you.groups.connections.description"),
          content: (
            <>
              <ConnectedAppsCard />
              <ApiKeysCard />
            </>
          ),
        },
        {
          id: "devices-and-sharing",
          title: t("settings.you.groups.devices.title"),
          description: t("settings.you.groups.devices.description"),
          content: (
            <>
              <InstallCard />
              <ShareCard />
            </>
          ),
        },
        {
          id: "your-data",
          title: t("settings.you.groups.data.title"),
          description: t("settings.you.groups.data.description"),
          content: <MyDataCard />,
        },
      ]}
    />
  )
}
