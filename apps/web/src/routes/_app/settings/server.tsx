import { createFileRoute, redirect } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { meQuery } from "@/features/auth/queries"
import {
  ServerAiKeysCard,
  ServerAiPolicyCard,
  ServerAiSpendCard,
} from "@/features/ai/server-ai-cards"
import { serverAiQuery } from "@/features/ai/queries"
import { SettingsPage } from "@/features/settings/settings-page"
import { AboutCard } from "@/features/server/about-card"
import { AuthCard } from "@/features/server/auth-card"
import { OAuthClientsCard } from "@/features/server/oauth-clients-card"
import { ErrorTrackingCard } from "@/features/server/error-tracking-card"
import { EmailCard } from "@/features/server/email-card"
import { JobsCard, serverJobsQuery } from "@/features/server/jobs-card"
import { KrogerCard } from "@/features/server/kroger-card"
import { NutritionCard } from "@/features/server/nutrition-card"
import { PhotosCard } from "@/features/server/photos-card"
import { SitesCard } from "@/features/server/sites-card"
import { VoiceCard } from "@/features/server/voice-card"
import {
  serverSettingsQuery,
  telemetryReportQuery,
  telemetryStatusQuery,
} from "@/features/server/queries"
import { TelemetryCard } from "@/features/server/telemetry-card"
import { VideoCard } from "@/features/server/video-card"
import { WalmartCard } from "@/features/server/walmart-card"

export const Route = createFileRoute("/_app/settings/server")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me?.serverAdmin) throw redirect({ to: "/settings/you" })
  },
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(serverSettingsQuery),
      queryClient.ensureQueryData(telemetryReportQuery),
      queryClient.ensureQueryData(telemetryStatusQuery),
      queryClient.ensureQueryData(serverJobsQuery),
      queryClient.ensureQueryData(serverAiQuery),
    ]),
  component: ServerSettings,
})

function ServerSettings() {
  const { t } = useTranslation()

  return (
    <SettingsPage
      groups={[
        {
          id: "server-overview",
          title: t("settings.server.groups.overview.title"),
          description: t("settings.server.groups.overview.description"),
          content: <AboutCard />,
        },
        {
          id: "access-and-email",
          title: t("settings.server.groups.access.title"),
          description: t("settings.server.groups.access.description"),
          content: (
            <>
              <AuthCard />
              <OAuthClientsCard />
              <EmailCard />
            </>
          ),
        },
        {
          id: "server-ai",
          title: t("settings.server.groups.ai.title"),
          description: t("settings.server.groups.ai.description"),
          content: (
            <>
              <ServerAiKeysCard />
              <ServerAiPolicyCard />
              <ServerAiSpendCard />
            </>
          ),
        },
        {
          id: "recipe-services",
          title: t("settings.server.groups.recipes.title"),
          description: t("settings.server.groups.recipes.description"),
          content: (
            <>
              <VideoCard />
              <NutritionCard />
              <SitesCard />
              <PhotosCard />
              <VoiceCard />
            </>
          ),
        },
        {
          id: "store-connections",
          title: t("settings.server.groups.stores.title"),
          description: t("settings.server.groups.stores.description"),
          content: (
            <>
              <KrogerCard />
              <WalmartCard />
            </>
          ),
        },
        {
          id: "server-operations",
          title: t("settings.server.groups.operations.title"),
          description: t("settings.server.groups.operations.description"),
          content: (
            <>
              <ErrorTrackingCard />
              <TelemetryCard />
              <JobsCard />
            </>
          ),
        },
      ]}
    />
  )
}
