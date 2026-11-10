import { useQuery, type QueryClient } from "@tanstack/react-query"
import { redirect } from "@tanstack/react-router"

import { meQuery } from "@/features/auth/queries"
import { useMe } from "@/features/auth/use-me"
import { capabilitiesQuery } from "@/features/capabilities/queries"

import {
  settingsRedirect,
  viewerFrom,
  type HalfId,
  type SettingsPageId,
  type Viewer,
} from "./pages"

/**
 * For a half's beforeLoad: sends someone who opens a half of Settings they
 * can't see, by an old link or by typing it, to one they can.
 */
export async function ensureSettingsAccess(
  queryClient: QueryClient,
  pageId: SettingsPageId,
  halfId: HalfId
): Promise<void> {
  const [me, capabilities] = await Promise.all([
    queryClient.ensureQueryData(meQuery),
    queryClient.ensureQueryData(capabilitiesQuery),
  ])
  // Signing in is the app layout's job; without someone there's nothing to decide.
  if (!me) return
  const viewer = viewerFrom(me, capabilities.capabilities)
  const to = settingsRedirect(pageId, halfId, viewer)
  if (to) throw redirect({ to })
}

/** Who's looking at Settings, for the navigation and the switch. */
export function useSettingsViewer(): Viewer {
  const me = useMe()
  const { data } = useQuery(capabilitiesQuery)
  return viewerFrom(me, data?.capabilities)
}
