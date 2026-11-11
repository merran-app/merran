import type { HouseholdRole } from "@/features/household/queries"

/**
 * Settings' pages, by topic. A page has one or two halves: yours or the
 * household's, and on some the whole server's, which only the server admin
 * sees. The sidebar, the phone list, the switch between halves and the
 * routes' guards all read from this list, so who sees what is decided here.
 *
 * Kept free of runtime imports so node:test can load it.
 */

export type SettingsPageId =
  | "profile"
  | "signIn"
  | "apps"
  | "webhooks"
  | "household"
  | "planning"
  | "recipes"
  | "ai"
  | "shopping"
  | "importExport"
  | "server"

export type HalfId = "you" | "household" | "server"

/** Who sees a half: anyone, anyone in a household, its owners and admins, or the server admin. */
export type Access =
  "everyone" | "inHousehold" | "householdAdmin" | "serverAdmin"

/** What decides which settings someone sees. */
export type Viewer = {
  serverAdmin: boolean
  householdRole: HouseholdRole | null
  /** The optional parts that are on, from GET /api/capabilities. */
  capabilities: readonly string[]
}

type HalfDefinition = {
  id: HalfId
  to: string
  access: Access
  /**
   * An optional part every card on the half needs. With it off the half
   * would be empty, so it isn't offered at all.
   */
  requires?: string
}

type PageDefinition = {
  id: SettingsPageId
  path: string
  titleKey: string
  descriptionKey: string
  halves: readonly HalfDefinition[]
}

export const SETTINGS_PAGES = [
  {
    id: "profile",
    path: "/settings/profile",
    titleKey: "settings.topics.profile.title",
    descriptionKey: "settings.topics.profile.description",
    halves: [{ id: "you", to: "/settings/profile", access: "everyone" }],
  },
  {
    id: "signIn",
    path: "/settings/sign-in",
    titleKey: "settings.topics.signIn.title",
    descriptionKey: "settings.topics.signIn.description",
    halves: [
      { id: "you", to: "/settings/sign-in", access: "everyone" },
      { id: "server", to: "/settings/sign-in/server", access: "serverAdmin" },
    ],
  },
  {
    id: "apps",
    path: "/settings/apps",
    titleKey: "settings.topics.apps.title",
    descriptionKey: "settings.topics.apps.description",
    halves: [
      { id: "you", to: "/settings/apps", access: "everyone" },
      {
        id: "server",
        to: "/settings/apps/server",
        access: "serverAdmin",
        // OAuth applications is its only card, and it shows only with OAuth on.
        requires: "auth.oauth",
      },
    ],
  },
  {
    id: "webhooks",
    path: "/settings/webhooks",
    titleKey: "settings.topics.webhooks.title",
    descriptionKey: "settings.topics.webhooks.description",
    halves: [
      {
        id: "household",
        to: "/settings/webhooks",
        access: "householdAdmin",
        // The household's webhooks wait while the server has webhooks off.
        requires: "webhooks",
      },
      // Not tied to webhooks being on: it's where the server admin turns them on.
      { id: "server", to: "/settings/webhooks/server", access: "serverAdmin" },
    ],
  },
  {
    id: "household",
    path: "/settings/household",
    titleKey: "settings.topics.household.title",
    descriptionKey: "settings.topics.household.description",
    halves: [
      { id: "household", to: "/settings/household", access: "inHousehold" },
      {
        id: "server",
        to: "/settings/household/server",
        access: "serverAdmin",
      },
    ],
  },
  {
    id: "planning",
    path: "/settings/planning",
    titleKey: "settings.topics.planning.title",
    descriptionKey: "settings.topics.planning.description",
    halves: [
      { id: "household", to: "/settings/planning", access: "inHousehold" },
    ],
  },
  {
    id: "recipes",
    path: "/settings/recipes",
    titleKey: "settings.topics.recipes.title",
    descriptionKey: "settings.topics.recipes.description",
    halves: [
      { id: "household", to: "/settings/recipes", access: "householdAdmin" },
      { id: "server", to: "/settings/recipes/server", access: "serverAdmin" },
    ],
  },
  {
    id: "ai",
    path: "/settings/ai",
    titleKey: "settings.topics.ai.title",
    descriptionKey: "settings.topics.ai.description",
    halves: [
      { id: "household", to: "/settings/ai", access: "householdAdmin" },
      { id: "server", to: "/settings/ai/server", access: "serverAdmin" },
    ],
  },
  {
    id: "shopping",
    path: "/settings/shopping",
    titleKey: "settings.topics.shopping.title",
    descriptionKey: "settings.topics.shopping.description",
    halves: [
      { id: "household", to: "/settings/shopping", access: "householdAdmin" },
      { id: "server", to: "/settings/shopping/server", access: "serverAdmin" },
    ],
  },
  {
    id: "importExport",
    path: "/settings/import-export",
    titleKey: "settings.topics.importExport.title",
    descriptionKey: "settings.topics.importExport.description",
    halves: [
      {
        id: "household",
        to: "/settings/import-export",
        access: "householdAdmin",
      },
      {
        id: "server",
        to: "/settings/import-export/server",
        access: "serverAdmin",
      },
    ],
  },
  {
    id: "server",
    path: "/settings/server",
    titleKey: "settings.topics.server.title",
    descriptionKey: "settings.topics.server.description",
    halves: [{ id: "server", to: "/settings/server", access: "serverAdmin" }],
  },
] as const satisfies readonly PageDefinition[]

type SettingsPage = (typeof SETTINGS_PAGES)[number]

export type SettingsHalf = SettingsPage["halves"][number]

/** Where a page or half lives: every address the list names. */
export type SettingsTo = SettingsHalf["to"]

/** A page as one person sees it: only their halves, and where it opens. */
export type VisiblePage = Omit<SettingsPage, "halves"> & {
  halves: SettingsHalf[]
  to: SettingsTo
}

function canSee(access: Access, viewer: Viewer) {
  switch (access) {
    case "everyone":
      return true
    case "inHousehold":
      return viewer.householdRole !== null
    case "householdAdmin":
      return (
        viewer.householdRole === "owner" || viewer.householdRole === "admin"
      )
    case "serverAdmin":
      return viewer.serverAdmin
  }
}

function canSeeHalf(half: HalfDefinition, viewer: Viewer) {
  if (half.requires && !viewer.capabilities.includes(half.requires)) {
    return false
  }
  return canSee(half.access, viewer)
}

function halvesFor(page: SettingsPage, viewer: Viewer): SettingsHalf[] {
  const halves: readonly SettingsHalf[] = page.halves
  return halves.filter((half) => canSeeHalf(half, viewer))
}

/** The pages someone sees, in order, each opening on its first half they can see. */
export function visiblePages(viewer: Viewer): VisiblePage[] {
  const pages: VisiblePage[] = []
  for (const page of SETTINGS_PAGES) {
    const halves = halvesFor(page, viewer)
    const first = halves[0]
    if (!first) continue
    pages.push({ ...page, halves, to: first.to })
  }
  return pages
}

/**
 * Where to send someone who opens a half they can't see: the page's other
 * half if they can see that, or else Settings. Null when they can see it.
 */
export function settingsRedirect(
  pageId: SettingsPageId,
  halfId: HalfId,
  viewer: Viewer
): SettingsTo | "/settings" | null {
  const page = SETTINGS_PAGES.find((each) => each.id === pageId)
  if (!page) return "/settings"
  const halves = halvesFor(page, viewer)
  if (halves.some((half) => half.id === halfId)) return null
  return halves[0]?.to ?? "/settings"
}

/**
 * Why someone sees a page without its household half: what it needs is
 * switched off on the server, they're in no household, or they aren't an
 * admin of the one in use. Null when the page has no household half to
 * miss, or shows it.
 */
export function missingHouseholdHalf(
  pageId: SettingsPageId,
  viewer: Viewer
): "switchedOff" | "noHousehold" | "notAdmin" | null {
  const page = SETTINGS_PAGES.find((each) => each.id === pageId)
  if (!page) return null
  const halves: readonly HalfDefinition[] = page.halves
  const household = halves.find((half) => half.id === "household")
  if (!household || canSeeHalf(household, viewer)) return null
  if (household.requires && !viewer.capabilities.includes(household.requires)) {
    return "switchedOff"
  }
  return viewer.householdRole === null ? "noHousehold" : "notAdmin"
}

/** Who's looking, from the signed-in person: their role in the household in use. */
export function viewerFrom(
  me: {
    serverAdmin: boolean
    activeHouseholdId: string | null
    households: readonly { id: string; role: HouseholdRole }[]
  },
  capabilities: readonly string[] = []
): Viewer {
  // The same household useActiveHousehold picks: the active one, or the first.
  const household =
    me.households.find((each) => each.id === me.activeHouseholdId) ??
    me.households[0]
  return {
    serverAdmin: me.serverAdmin,
    householdRole: household?.role ?? null,
    capabilities,
  }
}

/** The page an address is on, or null for Settings itself. */
export function pageAt(pathname: string): SettingsPageId | null {
  const page = SETTINGS_PAGES.find(
    (each) => pathname === each.path || pathname.startsWith(each.path + "/")
  )
  return page?.id ?? null
}
