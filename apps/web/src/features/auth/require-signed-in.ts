import type { QueryClient } from "@tanstack/react-query"
import { redirect } from "@tanstack/react-router"

import { applyLanguage } from "@/i18n"

import { meQuery, setupQuery } from "./queries"

/**
 * For pages that need someone signed in: anyone else goes to sign in and
 * comes back after, or to setup on a server nobody has set up yet.
 */
export async function requireSignedIn(queryClient: QueryClient, href: string) {
  const me = await queryClient.ensureQueryData(meQuery)
  if (me?.requiresTwoFactor)
    throw redirect({ to: "/verify", search: { redirect: href } })
  // The person's own language, before any page of the app draws.
  if (me) return applyLanguage(me.language)

  const setup = await queryClient.fetchQuery(setupQuery)
  if (setup.needed) throw redirect({ to: "/setup" })
  throw redirect({ to: "/login", search: { redirect: href } })
}
