import { Outlet } from "@tanstack/react-router"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AssistantProvider } from "@/features/assistant/assistant-context"
import { AfterCookingProvider } from "@/features/cook/after-cooking-context"
import { AssistantPanel } from "@/features/assistant/assistant-panel"
import { EdgeBack } from "@/features/gestures/edge-back"
import { PullToRefresh } from "@/features/gestures/pull-to-refresh"
import { InstallGuide } from "@/features/install/install-ui"
import { LiveUpdates } from "@/features/live/live-updates"
import { TelemetryQuestion } from "@/features/server/telemetry-question"
import { OnboardingProvider } from "@/features/onboarding/onboarding-context"
import { TourProvider } from "@/features/onboarding/tour-context"
import { AutomaticTour } from "@/features/onboarding/automatic-tour"

import { AppSidebar } from "./app-sidebar"
import { BottomNav } from "./bottom-nav"
import { TopBar } from "./top-bar"

export function AppShell() {
  return (
    <OnboardingProvider>
      <TourProvider>
        <AssistantProvider>
          <AfterCookingProvider>
            <SidebarProvider>
              <AppSidebar />
              <SidebarInset>
                <TopBar />
                {/* Bottom padding keeps content clear of the phone's tab bar. */}
                <main
                  data-tour="page"
                  className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 md:px-8 md:pb-12"
                >
                  <AutomaticTour />
                  <LiveUpdates>
                    <Outlet />
                  </LiveUpdates>
                </main>
              </SidebarInset>
              <BottomNav />
              <InstallGuide />
              {/* Only in the installed app, where the phone doesn't do these itself. */}
              <PullToRefresh />
              <EdgeBack />
              <TelemetryQuestion />
              <AssistantPanel />
            </SidebarProvider>
          </AfterCookingProvider>
        </AssistantProvider>
      </TourProvider>
    </OnboardingProvider>
  )
}
