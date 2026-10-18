/** Stable targets are shared by desktop navigation and the phone tabs. */
export const TOUR_VERSION = 1
export const TOUR_IDS = [
  "today",
  "recipes",
  "plan",
  "list",
  "pantry",
  "recipe",
  "settings",
  "assistant",
] as const
export type TourId = (typeof TOUR_IDS)[number]
export function tourForPath(path: string): TourId | null {
  if (
    path.includes("/cook") ||
    path.endsWith("/edit") ||
    path === "/recipes/new"
  )
    return null
  if (path === "/") return "today"
  if (path.startsWith("/settings")) return "settings"
  if (path === "/recipes" || path === "/recipes/") return "recipes"
  if (/^\/recipes\/[^/]+\/?$/.test(path)) return "recipe"
  if (path === "/plan") return "plan"
  if (path === "/list") return "list"
  if (path === "/pantry") return "pantry"
  return null
}

export const GLOSSARY_IDS = [
  "everyWeek",
  "alwaysOnHand",
  "useSoon",
  "pool",
  "themeNights",
  "goesWith",
  "proposals",
  "keys",
] as const
