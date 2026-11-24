import { SparklesIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { queryOptions, useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useMe } from "@/features/auth/use-me"
import { api, unwrap, type Schemas } from "@/lib/api/client"

// The update check (docs/operations.md, "Releases and updates"): Merran's
// newest release, which the server looks for on GitHub every 6 hours. The
// server admin sees an Update badge in the sidebar and the account menu,
// and This server says what's new and how to update (updates-section.tsx).

export type Updates = Schemas["Updates"]

export const updatesQuery = queryOptions({
  queryKey: ["settings", "server", "updates"],
  queryFn: () => unwrap(api.GET("/api/settings/server/updates")),
  // The server looks every 6 hours; an hour's wait here is plenty.
  staleTime: 60 * 60_000,
})

/** What the update check found, for the server admin only. */
export function useUpdates() {
  const me = useMe()
  const { data } = useQuery({ ...updatesQuery, enabled: me.serverAdmin })
  return me.serverAdmin ? data : undefined
}

/** In the sidebar, under the pages: there's a newer Merran. */
export function UpdateSidebarItem() {
  const { t } = useTranslation()
  const updates = useUpdates()
  if (!updates?.newer || !updates.latest) return null
  const label = t("updates.badge", { version: updates.latest.version })
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={label}
          render={<Link to="/settings/server" />}
          className="text-primary"
        >
          <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} />
          <span>{label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/** In the account menu, which phones have in place of the sidebar. */
export function UpdateMenuItem() {
  const { t } = useTranslation()
  const updates = useUpdates()
  if (!updates?.newer || !updates.latest) return null
  return (
    <DropdownMenuItem render={<Link to="/settings/server" />}>
      <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} />
      {t("updates.badge", { version: updates.latest.version })}
    </DropdownMenuItem>
  )
}
