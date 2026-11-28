import type { QueryClient } from "@tanstack/react-query"

/** The areas Today's summary counts. */
const AREAS = ["list", "pantry", "recipes", "plan"]

/**
 * Makes Today's summary stale when this device changes one of the areas it
 * counts. The live stream tells other devices, not the one that made the
 * change, so without this Today would keep showing the old numbers until it
 * went stale on its own. A change is a query invalidated, or one set by
 * hand; a query that only loaded says nothing changed. Returns the way to
 * stop.
 */
export function followOwnChanges(queryClient: QueryClient) {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return
    if (!AREAS.includes(String(event.query.queryKey[0]))) return

    const { action } = event
    const changed =
      action.type === "invalidate" ||
      (action.type === "success" && action.manual === true)
    if (!changed) return

    void queryClient.invalidateQueries({ queryKey: ["today"] })
  })
}
