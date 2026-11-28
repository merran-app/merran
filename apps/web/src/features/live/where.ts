/** Pages that say who else has them open. */
export type LivePage = "list" | "plan"

/** The page a path is, when it's one that says who has it open. */
export function pageOf(path: string): LivePage | null {
  if (path === "/list" || path.startsWith("/list/")) return "list"
  if (path === "/plan" || path.startsWith("/plan/")) return "plan"
  return null
}

/**
 * Whether the live stream is wanted on the page open, from the routes it
 * matched: in the app and in the cook view, which is outside the app's
 * layout but still the household's own. Not on sign-in pages, nor a recipe
 * someone shared, where nobody's signed in.
 */
export function liveWanted(routeIds: string[]): boolean {
  return routeIds.some((id) => id === "/_app" || id === "/_focus")
}
