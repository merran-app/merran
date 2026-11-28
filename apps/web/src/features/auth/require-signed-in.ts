import type { QueryClient } from "@tanstack/react-query"
import { redirect } from "@tanstack/react-router"

import { applyLanguage } from "@/i18n"

import { householdQuery } from "@/features/household/queries"

import { meQuery, setupQuery } from "./queries"

/**
 * For pages that need someone signed in: anyone else goes to sign in and
 * comes back after, or to setup on a server nobody has set up yet.
 */
export async function requireSignedIn(queryClient: QueryClient, href: string) {
  // The household goes with the sign-in check, so every page knows its clock
  // (today, its week) from the first render. Prefetching never throws: for
  // anyone signed out its refused answer leaves the query without data, so
  // it's asked again once they're signed in.
  const household = queryClient.prefetchQuery(householdQuery)
  const me = await queryClient.ensureQueryData(meQuery)
  if (me?.requiresTwoFactor)
    throw redirect({ to: "/verify", search: { redirect: href } })
  if (me) {
    // Wait only for a household not seen yet. One already known is never
    // waited for: it's refreshed in the background when it's stale (every
    // 30 seconds while the live stream is down).
    if (!queryClient.getQueryData(householdQuery.queryKey)) await household
    // The person's own language, before any page of the app draws.
    return applyLanguage(me.language)
  }

  const setup = await queryClient.fetchQuery(setupQuery)
  if (setup.needed) throw redirect({ to: "/setup" })
  throw redirect({ to: "/login", search: { redirect: href } })
}
