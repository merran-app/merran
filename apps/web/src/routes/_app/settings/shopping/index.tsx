import { createFileRoute } from "@tanstack/react-router"

import { PantryCard } from "@/features/household/pantry-card"
import { householdQuery } from "@/features/household/queries"
import { ensureSettingsAccess } from "@/features/settings/guard"
import { TopicPage } from "@/features/settings/topic-page"
import { StoresCard } from "@/features/stores/stores-card"
import { YourStoresCard } from "@/features/stores/your-stores-card"

/** How linking a Kroger account went, when Kroger sends someone back. */
type ShoppingSearch = {
  kroger?: "linked" | "cancelled" | "failed"
  reason?: string
}

/** Settings → Shopping and stores, the household's half: the pantry, its stores, and a store account. */
export const Route = createFileRoute("/_app/settings/shopping/")({
  validateSearch: (search: Record<string, unknown>): ShoppingSearch => ({
    kroger:
      search.kroger === "linked" ||
      search.kroger === "cancelled" ||
      search.kroger === "failed"
        ? search.kroger
        : undefined,
    reason: typeof search.reason === "string" ? search.reason : undefined,
  }),
  beforeLoad: ({ context }) =>
    ensureSettingsAccess(context.queryClient, "shopping", "household"),
  loader: ({ context }) => context.queryClient.ensureQueryData(householdQuery),
  component: ShoppingSettings,
})

function ShoppingSettings() {
  return (
    <TopicPage page="shopping" half="household">
      <PantryCard />
      <YourStoresCard />
      <StoresCard />
    </TopicPage>
  )
}
