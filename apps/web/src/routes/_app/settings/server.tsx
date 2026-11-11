import { createFileRoute } from "@tanstack/react-router"

import { serverAiQuery } from "@/features/ai/queries"
import { AboutCard } from "@/features/server/about-card"
import { EmailCard } from "@/features/server/email-card"
import { ErrorTrackingCard } from "@/features/server/error-tracking-card"
import { JobsCard, serverJobsQuery } from "@/features/server/jobs-card"
import {
  serverSettingsQuery,
  telemetryReportQuery,
  telemetryStatusQuery,
} from "@/features/server/queries"
import { TelemetryCard } from "@/features/server/telemetry-card"
import { WebhooksCard } from "@/features/server/webhooks-card"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"

/** Settings → Server: what's running, email, and background work. */
export const Route = createFileRoute("/_app/settings/server")({
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "server", "server"),
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
  return (
    <TopicPage page="server" half="server">
      <AboutCard />
      <EmailCard />
      <JobsCard />
      <WebhooksCard />
      <ErrorTrackingCard />
      <TelemetryCard />
    </TopicPage>
  )
}
