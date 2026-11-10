# Settings by topic: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regroup Settings' 49 cards into ten topic pages, with a This household (or You) | Whole server switch on the seven pages that have both, and navigation to match on desktop and phones.

**Architecture:** One pure list in `apps/web/src/features/settings/pages.ts` names every page, its halves, their addresses and who sees each, and the sidebar, the phone list, the switch and the route guards all read from it. Each half is its own route file under `routes/_app/settings/`, rendering a shared `TopicPage` around the existing cards, which move unchanged. Elsewhere, links into settings, Kroger's return and the sign-on return point at the new addresses, and the guides follow.

**Tech Stack:** React, TanStack Router (file routes) and Query, i18next, node:test for web helpers, Hono and Vitest on the server, Astro Starlight for the guides.

**Spec:** [docs/superpowers/specs/2026-11-09-settings-by-topic-design.md](../specs/2026-11-09-settings-by-topic-design.md)

## Global constraints

- Work in `D:\Development\Mise\.claude\worktrees\settings-by-topic`, branch `feat/settings-by-topic`, cut from `origin/main`. The main checkout is on another session's branch: never commit there, and never stop or restart the user's dev servers on ports 3000 and 5173.
- Cards move as they are. Don't reword, split or merge a card, or change what it does.
- Every card's own access rule stays as it is today (for example Invitations, Planning, Theme nights and Plan each week stay for household admins inside pages everyone sees).
- No change to API routes, the database, or how server settings are stored and set.
- Words people read go in `apps/web/src/locales/en.json`. Guides quote labels exactly.
- Mobile uses drawers, never modal dialogs. This change adds no dialogs.
- Run Prettier from the root (`pnpm format`), never on `docs/`, which is written by hand.
- Run the `api` scripts in PowerShell with `$env:pnpm_config_cache_dir = "D:\Development\Mise\.local\pnpm-cache"`.
- Match the code around you: plain-English comments that say why, normal line breaks, named helpers, nothing packed onto one line.
- Commit messages are plain English and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- TDD where there's logic: write the test, watch it fail for the right reason, then write the code.

## Review focus

1. **A server admin who is only a member of the household they're in.** Recipes, AI, Shopping and stores, and Import and export show only their Whole server half, open on it, with no switch. Their household-half addresses redirect to the server half. Pinned in Task 1, checked in Task 5.
2. **No household, or switching to a household where you're only a member while on an admin page.** Nothing crashes. Without a household, a member sees Profile, Sign-in and Apps and devices. A server admin also sees Household with only Start another household. After a switch, the guard sends you to a page you can see. Pinned in Task 1, checked in Task 5.
3. **Typing an address you can't use.** A member opening `/settings/ai` or `/settings/household/server` lands on a page they can see, never on a broken or empty page. Pinned in Task 1 (`settingsRedirect`), checked in Task 5.
4. **Old addresses and Kroger's return.** `/settings/you` lands on Profile. Linking Kroger comes back to `/settings/shopping` with its message. An old `/settings/household?kroger=linked` link still opens Household without an error. Pinned in Task 3, checked in Task 5.
5. **Phone width.** `/settings` shows the list on a phone and goes to the first page on a larger screen, with no redirect loop when the window crosses 768 pixels. A page's back link returns to the list. Checked in Tasks 2 and 5.

---

### Task 1: The list of pages, and who sees what

**Files:**
- Create: `apps/web/src/features/settings/pages.ts`
- Test: `apps/web/src/features/settings/pages.test.ts`
- Modify: `apps/web/package.json` (add the test to the `test` script's list)
- Move in: the spec and this plan (see Step 1)

**Interfaces:**
- Produces, from `apps/web/src/features/settings/pages.ts`. This file has no runtime imports from `@/`, so `node --test` can load it. Type-only imports are fine.
  - `type SettingsPageId = "profile" | "signIn" | "apps" | "household" | "planning" | "recipes" | "ai" | "shopping" | "importExport" | "server"`
  - `type HalfId = "you" | "household" | "server"`
  - `type Access = "everyone" | "inHousehold" | "householdAdmin" | "serverAdmin"`
  - `type Viewer = { serverAdmin: boolean; householdRole: HouseholdRole | null }`, where `HouseholdRole` is a type-only import from `@/features/household/queries`
  - `SETTINGS_PAGES`, declared `as const satisfies readonly PageDefinition[]` so that every `to` keeps its literal route type for `<Link to>` and `redirect({ to })`. Each entry is `{ id, path, titleKey, descriptionKey, halves: [{ id: HalfId, to, access: Access }] }`, in this order:

    | id | path | halves: id → to (access) |
    | --- | --- | --- |
    | profile | `/settings/profile` | you → `/settings/profile` (everyone) |
    | signIn | `/settings/sign-in` | you → `/settings/sign-in` (everyone); server → `/settings/sign-in/server` (serverAdmin) |
    | apps | `/settings/apps` | you → `/settings/apps` (everyone); server → `/settings/apps/server` (serverAdmin) |
    | household | `/settings/household` | household → `/settings/household` (inHousehold); server → `/settings/household/server` (serverAdmin) |
    | planning | `/settings/planning` | household → `/settings/planning` (inHousehold) |
    | recipes | `/settings/recipes` | household → `/settings/recipes` (householdAdmin); server → `/settings/recipes/server` (serverAdmin) |
    | ai | `/settings/ai` | household → `/settings/ai` (householdAdmin); server → `/settings/ai/server` (serverAdmin) |
    | shopping | `/settings/shopping` | household → `/settings/shopping` (householdAdmin); server → `/settings/shopping/server` (serverAdmin) |
    | importExport | `/settings/import-export` | household → `/settings/import-export` (householdAdmin); server → `/settings/import-export/server` (serverAdmin) |
    | server | `/settings/server` | server → `/settings/server` (serverAdmin) |

    `titleKey` and `descriptionKey` are `settings.topics.<id>.title` and `settings.topics.<id>.description` (Task 2 adds the words).
  - `viewerFrom(me: { serverAdmin: boolean; activeHouseholdId: string | null; households: readonly { id: string; role: HouseholdRole }[] }): Viewer`. It uses the active household, falling back to the first one the same way `useActiveHousehold` does, and `null` with none.
  - `visiblePages(viewer: Viewer): VisiblePage[]`. A `VisiblePage` is the page's entry with `halves` cut to the visible ones, plus `to`, the first visible half's address. Pages with no visible half are left out.
  - `settingsRedirect(pageId: SettingsPageId, halfId: HalfId, viewer: Viewer)`. It returns `null` when that half is visible. Otherwise it returns the `to` of the page's first visible half, or `"/settings"` when the page has none.
  - `pageAt(pathname: string): SettingsPageId | null`. It returns the page whose `path` equals the pathname or starts it followed by `/`.

- [ ] **Step 1: Make the worktree and bring the spec and plan into it**

```bash
cd /d/Development/Mise
git fetch origin
git worktree add .claude/worktrees/settings-by-topic -b feat/settings-by-topic origin/main
mkdir -p .claude/worktrees/settings-by-topic/docs/superpowers/specs .claude/worktrees/settings-by-topic/docs/superpowers/plans
mv docs/superpowers/specs/2026-11-09-settings-by-topic-design.md .claude/worktrees/settings-by-topic/docs/superpowers/specs/
mv docs/superpowers/plans/2026-11-09-settings-by-topic.md .claude/worktrees/settings-by-topic/docs/superpowers/plans/
cd .claude/worktrees/settings-by-topic && pnpm install
git add docs/superpowers && git commit -m "Plan settings by topic: the spec and the implementation plan"
```

Expected: the worktree is on `feat/settings-by-topic`, the two files are committed there, and they're gone from the main checkout.

- [ ] **Step 2: Write the failing tests in `pages.test.ts`**

```ts
const member = { serverAdmin: false, householdRole: "member" } as const
const householdAdmin = { serverAdmin: false, householdRole: "admin" } as const
const runsServer = { serverAdmin: true, householdRole: "owner" } as const
const serverAdminAsMember = { serverAdmin: true, householdRole: "member" } as const
const noHousehold = { serverAdmin: false, householdRole: null } as const
const serverAdminNoHousehold = { serverAdmin: true, householdRole: null } as const

const ids = (viewer: Viewer) => visiblePages(viewer).map((page) => page.id)
const page = (viewer: Viewer, id: SettingsPageId) =>
  visiblePages(viewer).find((each) => each.id === id)

test("a member sees their own pages, Household and Planning", () => {
  assert.deepEqual(ids(member), ["profile", "signIn", "apps", "household", "planning"])
})

test("a household admin sees every page but Server, none with a server half", () => {
  assert.deepEqual(ids(householdAdmin), ["profile", "signIn", "apps", "household", "planning", "recipes", "ai", "shopping", "importExport"])
  for (const each of visiblePages(householdAdmin)) assert.equal(each.halves.length, 1)
})

test("the server admin gets every page, and a switch on seven", () => {
  assert.equal(ids(runsServer).length, 10)
  const switched = visiblePages(runsServer).filter((each) => each.halves.length === 2)
  assert.deepEqual(switched.map((each) => each.id), ["signIn", "apps", "household", "recipes", "ai", "shopping", "importExport"])
})

test("a server admin who is a member opens admin pages on their server half", () => {
  assert.deepEqual(page(serverAdminAsMember, "recipes")?.halves.map((half) => half.id), ["server"])
  assert.equal(page(serverAdminAsMember, "recipes")?.to, "/settings/recipes/server")
  assert.deepEqual(page(serverAdminAsMember, "household")?.halves.map((half) => half.id), ["household", "server"])
})

test("with no household, only your own pages", () => {
  assert.deepEqual(ids(noHousehold), ["profile", "signIn", "apps"])
})

test("a server admin with no household keeps the server halves", () => {
  assert.deepEqual(ids(serverAdminNoHousehold), ["profile", "signIn", "apps", "household", "recipes", "ai", "shopping", "importExport", "server"])
  assert.equal(page(serverAdminNoHousehold, "household")?.to, "/settings/household/server")
})

test("a half you can't see sends you to one you can", () => {
  assert.equal(settingsRedirect("household", "server", member), "/settings/household")
  assert.equal(settingsRedirect("ai", "household", member), "/settings")
  assert.equal(settingsRedirect("recipes", "household", serverAdminAsMember), "/settings/recipes/server")
  assert.equal(settingsRedirect("ai", "server", runsServer), null)
})

test("the viewer is who you are in the household in use", () => {
  const households = [{ id: "a", role: "owner" }, { id: "b", role: "member" }] as const
  assert.equal(viewerFrom({ serverAdmin: false, activeHouseholdId: "b", households }).householdRole, "member")
  assert.equal(viewerFrom({ serverAdmin: false, activeHouseholdId: null, households }).householdRole, "owner")
  assert.equal(viewerFrom({ serverAdmin: true, activeHouseholdId: null, households: [] }).householdRole, null)
})

test("the page is found from its address", () => {
  assert.equal(pageAt("/settings/ai/server"), "ai")
  assert.equal(pageAt("/settings/import-export"), "importExport")
  assert.equal(pageAt("/settings/household/server"), "household")
  assert.equal(pageAt("/settings/server"), "server")
  assert.equal(pageAt("/settings"), null)
})
```

Add `src/features/settings/pages.test.ts` to the `test` script's file list in `apps/web/package.json`.

- [ ] **Step 3: Run the tests and watch them fail**

Run: `pnpm --filter @merran/web test`
Expected: FAIL, because `./pages.ts` doesn't exist yet.

- [ ] **Step 4: Write `pages.ts` to the interface above**

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm --filter @merran/web test`
Expected: PASS, every test, the existing ones included.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add apps/web/src/features/settings/pages.ts apps/web/src/features/settings/pages.test.ts apps/web/package.json
git commit -m "Name settings' ten topic pages and who sees each half"
```

---

### Task 2: Settings by topic in the web app

**Files:**
- Create: `apps/web/src/features/settings/guard.ts`, `topic-page.tsx`, `settings-nav.tsx` (the desktop list and the phone list)
- Create, under `apps/web/src/routes/_app/settings/`: `profile.tsx`, `planning.tsx`, and `index.tsx` plus `server.tsx` in each of the folders `sign-in/`, `apps/`, `household/`, `recipes/`, `ai/`, `shopping/` and `import-export/`
- Modify: `routes/_app/settings.tsx` (the layout), `routes/_app/settings/index.tsx`, `routes/_app/settings/server.tsx` (it becomes the Server page), `routes/_app/settings/you.tsx` (it becomes a redirect)
- Delete: `routes/_app/settings/household.tsx`, `routes/_app/settings/import-export.tsx`, `features/settings/settings-page.tsx`
- Modify: `apps/web/src/features/stores/stores-card.tsx:48`, `apps/web/src/locales/en.json`, `apps/web/src/routeTree.gen.ts` (regenerated)

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces:
  - `ensureSettingsAccess(queryClient: QueryClient, pageId: SettingsPageId, halfId: HalfId): Promise<void>` in `guard.ts`. It loads `meQuery`, builds the viewer with `viewerFrom`, and throws `redirect({ to })` when `settingsRedirect` returns an address. Every half's route calls it in `beforeLoad`.
  - `useSettingsViewer(): Viewer`, in `guard.ts`, from `useMe()`.
  - `<TopicPage page={SettingsPageId} half={HalfId}>{cards}</TopicPage>` in `topic-page.tsx`.
  - `<SettingsNav />` and `<SettingsList />` in `settings-nav.tsx`.

- [ ] **Step 1: Add the words to `en.json`**

Inside `"settings"`, add exactly these keys:

```json
"pagesLabel": "Settings pages",
"back": "Settings",
"halves": {
  "label": "Whose settings",
  "you": "You",
  "household": "This household",
  "server": "Whole server",
  "serverNote": "Changes here reach every household on this server."
},
"topics": {
  "profile": { "title": "Profile", "description": "How you appear, the language and look of Merran, and a copy of your data." },
  "signIn": { "title": "Sign-in", "description": "Ways to sign in and keep your account safe." },
  "apps": { "title": "Apps and devices", "description": "Merran on your devices, and other apps that connect to it." },
  "household": { "title": "Household", "description": "Its name, how its weeks work, and the people in it." },
  "planning": { "title": "Planning", "description": "Which meals fill, tastes, theme nights, the weekly plan and calendars." },
  "recipes": { "title": "Recipes", "description": "Nutrition, photos and sharing for the recipe library." },
  "ai": { "title": "AI", "description": "Which model each task uses, and whose key pays." },
  "shopping": { "title": "Shopping and stores", "description": "The pantry, the stores you shop at, and store accounts." },
  "importExport": { "title": "Import and export", "description": "Move a household, and bring recipes in from other places." },
  "server": { "title": "Server", "description": "What's running, outgoing email, and work in the background." }
}
```

Change `settings.description` to `"Everything you can change, by topic."`.

Replace the settings tour's words:
- `help.tours.settings.overview`: `"Settings are grouped by topic. Each page has everything you can change about it."`
- `help.tours.settings.action`: `"Pick a topic here. Profile, Sign-in, and Apps and devices are yours alone; the rest are shared with your household."`
- `help.tours.shared.server-settings`: `"As the server admin, you also get the Server page, and a Whole server switch on pages like AI and Shopping and stores. Changes there reach every household."`

- [ ] **Step 2: Write `guard.ts`**

`ensureSettingsAccess` and `useSettingsViewer`, as in Interfaces.

- [ ] **Step 3: Write `TopicPage`**

On a phone (`useIsMobile()`), it starts with a back link to `/settings` labelled `settings.back`. Then come the page's title as an `h2` and its description, from `SETTINGS_PAGES`.

When the page has two visible halves for `useSettingsViewer()`, a switch follows. It's two `Link`s to the halves' `to`, labelled `settings.halves.<id>`, inside a `nav` with `aria-label` `settings.halves.label`. The current one has `aria-current="page"`. Style it like today's settings pill tabs (`settings.tsx` before this change): a `bg-muted` track with `rounded-xl` items, the current one `bg-background shadow-sm`. On the server half, the current item is tinted instead with the palette's blue `chart-5` at low opacity (for example `bg-chart-5/15`), keeping the text in `foreground`. That way it follows every palette and dark mode with no new color token.

On the server half, `settings.halves.serverNote` follows in a callout with the same tint. The children come last, in `flex flex-col gap-4`.

- [ ] **Step 4: Write `SettingsNav` and `SettingsList`**

Both list `visiblePages(useSettingsViewer())` and link each page to its `to`.
- `SettingsNav` is the desktop column. It's a `nav` with `aria-label` `settings.pagesLabel` and `data-tour="page-actions"`. The current page is the one `pageAt(pathname)` returns, styled like the old section links in `settings-page.tsx`, with the active page highlighted.
- `SettingsList` is the phone list. Each row shows the page's title and its description on one line (truncated), with a chevron. Its root also has `data-tour="page-actions"`.
- In both, the Server page's entry has `data-tour="server-settings"`.

- [ ] **Step 5: Rewrite the layout and `/settings`**

`routes/_app/settings.tsx` shows the `PageHeader` (`nav.settings`, `settings.description`) on larger screens and, on a phone, only on `/settings` itself. Below it is a grid `md:grid-cols-[12rem_minmax(0,1fr)]`: `SettingsNav` (larger screens only), then the `Outlet`.

`routes/_app/settings/index.tsx` renders `SettingsList` on a phone. Otherwise it renders `<Navigate to={visiblePages(viewer)[0].to} replace />`. It never redirects in `beforeLoad`, so crossing 768 pixels on `/settings` doesn't loop.

- [ ] **Step 6: Write the pages**

Each half's route calls `ensureSettingsAccess(context.queryClient, page, half)` in `beforeLoad`. Its loader ensures the listed queries, in parallel as today's loaders do: "admin" means `isAdminRole` of the active household's role. It renders `<TopicPage page half>` around these cards, in this order:

| File | page / half | Cards | Loader ensures |
| --- | --- | --- | --- |
| `profile.tsx` | profile / you | `ProfileCard`, `LanguageCard`, `AppearanceCard`, `MyDataCard` | nothing |
| `sign-in/index.tsx` | signIn / you | `PasswordCard`, `PasskeysCard`, `TwoFactorCard`, `SsoCard` | nothing |
| `sign-in/server.tsx` | signIn / server | `AuthCard` | nothing |
| `apps/index.tsx` | apps / you | `InstallCard`, `ShareCard`, `ConnectedAppsCard`, `ApiKeysCard` | `apiKeysQuery` |
| `apps/server.tsx` | apps / server | `OAuthClientsCard` | nothing |
| `household/index.tsx` | household / household | `DetailsCard`, `MembersCard`, `InvitesCard` (admin) | `householdQuery`, `membersQuery`, `invitesQuery` (admin) |
| `household/server.tsx` | household / server | `NewHouseholdCard` | nothing |
| `planning.tsx` | planning / household | `PlanningCard` (admin), `TastesCard`, `ThemeNightsCard` (admin), `AutoplanCard` (admin), `CalendarCard canManage={admin}` | `householdQuery`, `calendarSettingsQuery`, `tastesQuery`, `themesQuery` (admin), `autoplanQuery` (admin) |
| `recipes/index.tsx` | recipes / household | `NutritionLibraryCard`, `PhotosCard` from `features/household`, `SharingCard` | `householdQuery` |
| `recipes/server.tsx` | recipes / server | `NutritionCard`, `PhotosCard` from `features/server`, `VoiceCard` | `serverSettingsQuery` |
| `ai/index.tsx` | ai / household | `HouseholdAiCard` | `householdAiQuery` |
| `ai/server.tsx` | ai / server | `ServerAiKeysCard`, `ServerAiPolicyCard`, `ServerAiSpendCard` | `serverAiQuery` |
| `shopping/index.tsx` | shopping / household | `PantryCard`, `YourStoresCard`, `StoresCard` | `householdQuery` |
| `shopping/server.tsx` | shopping / server | `KrogerCard`, `WalmartCard` | `serverSettingsQuery` |
| `import-export/index.tsx` | importExport / household | `ExportCard`, `ImportCard`, `AppImportCard` | nothing |
| `import-export/server.tsx` | importExport / server | `SitesCard`, `VideoCard`, `FlareSolverrCard` | `serverSettingsQuery` |
| `server.tsx` | server / server | `AboutCard`, `EmailCard`, `JobsCard`, `ErrorTrackingCard`, `TelemetryCard` | `serverSettingsQuery`, `telemetryReportQuery`, `telemetryStatusQuery`, `serverJobsQuery` |

- Move `household.tsx`'s `validateSearch` (Kroger's `kroger` and `reason`) to `shopping/index.tsx`. In `stores-card.tsx`, change `getRouteApi("/_app/settings/household")` to `getRouteApi("/_app/settings/shopping/")`.
- `you.tsx` becomes a route whose `beforeLoad` throws `redirect({ to: "/settings/profile" })`.
- Delete `household.tsx`, `import-export.tsx` and `features/settings/settings-page.tsx`.

- [ ] **Step 7: Remove the words nothing uses any more**

Remove `settings.sections`, `settings.onThisPage`, `settings.*.tab` and `settings.*.groups`. For `settings.household.none`, `settings.household.noneHint`, `sharing.settings.title` and `sharing.settings.description`, grep `apps/web/src` for each and remove it only if nothing else uses it.

- [ ] **Step 8: Regenerate the route tree, then check**

Run: `pnpm --filter @merran/web build` (the router plugin rewrites `src/routeTree.gen.ts`), then `pnpm typecheck`, `pnpm --filter @merran/web test`, `pnpm --filter @merran/web check:locales` and `pnpm format:check`.
Expected: all pass. A typecheck failure on a `Link to` or `getRouteApi` id means a route file's path doesn't match `SETTINGS_PAGES`. Fix the route file, not the list.

- [ ] **Step 9: Look at it**

Run the worktree's web app against the user's API: `pnpm exec vite --port 5174 --host 127.0.0.1` from `apps/web`. Open `http://127.0.0.1:5174/settings` and sign in as Claude, a household admin of The Johnsons. The account's details are in the main checkout's `.claude/dev-account.local`; never put the password in chat.

On desktop width, nine pages are listed, there's no switch, and each page shows its cards. At 375 pixels, `/settings` is the list, a page shows a back link, and the back link returns to the list. Stop the server afterwards.

- [ ] **Step 10: Commit**

```bash
pnpm format
git add -A apps/web
git commit -m "Group settings by topic, with a This household | Whole server switch"
```

---

### Task 3: Links into settings, Kroger's return and the sign-on return

**Files:**
- Modify: `apps/server/src/http/routes/stores/kroger/callback/get.ts:35`, `apps/server/src/http/routes/stores/stores.test.ts` (four expectations near lines 463, 469, 479 and 908)
- Modify: `apps/server/src/http/auth/methods.ts:34`, `apps/server/src/http/auth/oidc.test.ts:94`, `apps/server/src/http/web-app.test.ts:32`
- Regenerate: `apps/server/src/http/openapi/openapi.json`, `apps/web/src/lib/api/schema.d.ts`, `apps/extension/src/lib/schema.d.ts`
- Modify (web links): `features/ai/needs-ai.tsx:53`, `features/ai/household-ai-card.tsx:294`, `features/plan/not-filled.tsx:59`, `features/stores/kroger-basket-page.tsx:269`, `features/account/sso-card.tsx:39`, `routes/_focus/extension/connect.tsx:147`

**Interfaces:**
- Consumes: the addresses in Task 1's `SETTINGS_PAGES`.

- [ ] **Step 1: Change the Kroger test expectations first**

In `stores.test.ts`, every `/settings/household?kroger=` becomes `/settings/shopping?kroger=`, the regex `/^\/settings\/household\?kroger=failed&reason=/` included.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @merran/server test -- stores.test.ts`
Expected: FAIL on the four redirect expectations.

- [ ] **Step 3: Send Kroger's return to Shopping and stores**

In `kroger/callback/get.ts`, the redirect starts `/settings/shopping?kroger=`.

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm --filter @merran/server test -- stores.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the sign-on return and the sample addresses**

- `sso-card.tsx`: `callbackURL: "/settings/sign-in"`.
- `methods.ts`: the `requestExample` becomes `callbackURL: "/settings/sign-in"`.
- `oidc.test.ts`: `TEST_ORIGIN + "/settings/sign-in"`.
- `web-app.test.ts`: `"/settings/profile"` in the list of app paths.

Then run `pnpm --filter @merran/server openapi`, and in PowerShell with the cache variable from the Global constraints, `pnpm --filter @merran/web api` and `pnpm --filter @merran/extension api`.
Expected: `openapi.json` and both `schema.d.ts` files change only in that example, and the two `schema.d.ts` files match.

- [ ] **Step 6: Point the app's links at their pages**

| File | New target |
| --- | --- |
| `needs-ai.tsx` | `/settings/ai` |
| `household-ai-card.tsx` | `/settings/ai/server` |
| `not-filled.tsx` | `/settings/planning` |
| `kroger-basket-page.tsx` | `/settings/shopping` |
| `extension/connect.tsx` (`extension.toKeys`) | `/settings/apps` |

These keep their addresses, so leave them alone: `updates.tsx` and `optional-setup.tsx` (`/settings/server`, `/settings/household`, `/settings/import-export`), `welcome.tsx` (`/settings/import-export`), `new-household-card.tsx` (`/settings/household`), and `user-menu.tsx` (`/settings`).

- [ ] **Step 7: Check and commit**

Run: `pnpm typecheck`, `pnpm --filter @merran/server test`, `pnpm format:check`
Expected: all pass.

```bash
pnpm format
git add -A apps/server apps/web apps/extension
git commit -m "Send Kroger's return, sign-on's return and the app's links to the new settings pages"
```

---

### Task 4: Guides, the feature list and the platform doc

**Files:**
- Modify: the 27 guide pages under `apps/docs/src/content/docs/docs/` that quote a settings path. Find them with `grep -rnE "Settings( →|\*\*, \*\*)" apps/docs/src/content/docs`.
- Modify: `docs/features.md` (lines near 36, 50, 90, 160, 178, 210 and 214), `docs/platform.md` ("## Settings"), and the other `docs/*.md` files that quote a settings path. Find them with `grep -rnE "Settings( →|, )" docs/*.md`, leaving out `docs/superpowers/`.

- [ ] **Step 1: Rewrite every settings path with this mapping**

| Old | New |
| --- | --- |
| You → Language, Appearance, Your data; "Settings → You" alone | Profile → (same card) |
| You → Password, Passkeys, Two-step sign-in, Single sign-on | Sign-in → (same card) |
| You → API keys, Connected apps, Share to Merran, Merran on this device | Apps and devices → (same card) |
| Household → Invitations, Members; "Settings → Household" alone | Household → (same card) |
| Household → Planning, Theme nights, Plan each week, Tastes; Household → Meal planning → Calendar subscriptions | Planning → (same card) |
| Household → AI | AI |
| Household → AI photos, Nutrition for the library; Household → Sharing | Recipes → AI photos, Nutrition for the library; Recipes → Recipe links |
| Household → Stores, Your stores; Household → Shopping and stores → Pantry | Shopping and stores → (same card) |
| Import and export → … | unchanged |
| This server → Email, Jobs, Telemetry, Error tracking; "Settings → This server" for the address, release notes or the database in use | Server → (same card), or "Settings → Server" |
| This server → Authentication | Sign-in → Whole server → Authentication |
| This server → OAuth applications | Apps and devices → Whole server → OAuth applications |
| This server → AI, AI keys | AI → Whole server, AI → Whole server → AI keys |
| This server → Nutrition, AI photos, Voice | Recipes → Whole server → (same card) |
| This server → Video import, FlareSolverr | Import and export → Whole server → (same card) |
| This server → Kroger, Walmart | Shopping and stores → Whole server → (same card) |
| "Settings → This server" meaning server settings in general | the **Whole server** side of each page, and **Settings → Server** |

Where a sentence explains who sees what (for example `run/household-roles.md`: "Settings → This server is restricted to server administrators"), rewrite it to say that the Server page and each page's Whole server switch appear only for the server admin. Keep the guides' voice: they describe main as released, with no "not released yet" markers.

- [ ] **Step 2: Update the feature list**

In `docs/features.md`:
- Rename the row "Settings grouped by owner and task, with section links" to "Settings grouped by topic", status Built, with the note: "Ten pages by topic. A page with both household and server settings has a This household | Whole server switch, seen only by the server admin; on a phone, Settings is a list of pages".
- Note that "Settings for the server, the household and you, kept apart" now works through the switch.
- Update the settings paths quoted in the rows for updates, nutrition, Find at your stores, Kroger and Language, using the mapping above.

- [ ] **Step 3: Record the decision**

In `docs/platform.md` "## Settings", after the October 19 paragraph, add one paragraph headed "Settings navigation, revised November 9, 2026". It says settings are now ten pages by topic (list them). Pages with both household and server settings show one half at a time with a This household | Whole server switch, which only the server admin sees. On a phone, Settings is a list of pages. It links to the spec. Apply the same mapping to the other `docs/*.md` path quotes.

- [ ] **Step 4: Build the site**

Run: `pnpm docs:build`
Expected: it passes, with every link checked.

- [ ] **Step 5: Commit**

```bash
git add -A apps/docs docs
git commit -m "Describe settings by topic in the guides, the feature list and the platform doc"
```

---

### Task 5: Check it end to end, and open the pull request

- [ ] **Step 1: Run every check**

Run: `pnpm typecheck`, `pnpm format:check`, `pnpm --filter @merran/web test`, `pnpm --filter @merran/web check:locales`, `pnpm --filter @merran/server test`, `pnpm --filter @merran/extension build`, `pnpm docs:build`
Expected: all pass.

- [ ] **Step 2: Click through as each kind of person**

Use test servers on ports nobody else uses (the API on 3091 and Vite on 5191 have worked). Start the API on a `node:sqlite` `backup()` copy of `apps/server/data/merran.db`, with `secret` and `files/`, in the scratchpad, and with `MERRAN_TELEMETRY=off`. Add the launch entries to the main checkout's `.claude/launch.json` and call `preview_start` in the same message, then remove them. Open it at `http://pr.localhost:5191`.

- **Household admin** (the Claude account): sees 9 pages and no switch. `/settings/ai/server` sends it to `/settings/ai`. `/settings/server` sends it to `/settings`.
- **Member:** make one by invite in a throwaway household. Sees 5 pages. `/settings/ai` and `/settings/household/server` land on pages it can see.
- **Server admin:** a throwaway API with `MERRAN_DEV_SETUP=on`, claimed with the setup code from its log. Check the switch on the seven pages, that each page opens on its first half, the tinted Whole server half, and the Server page. Also check it as a member of a household (Review focus 1) and with no household (Review focus 2).
- **Everyone:** `/settings/you` lands on Profile. `/settings/household?kroger=linked` opens Household without an error. On desktop, `/settings` goes to the first page. At 375 pixels it shows the list, back links return to it, and resizing across 768 pixels on `/settings` doesn't loop. The settings tour runs and points at the page list (and, for the server admin, the Server entry).
- Linking a real Kroger account is out of scope for the copy: the copied data holds the user's linked Kroger account. The server test covers the return address.

Stop the test servers and delete their scratch folders.

- [ ] **Step 3: Open the pull request**

Push `feat/settings-by-topic` and open a pull request titled `feat: group settings by topic, with a Whole server switch`. The body says what moved and why, links the spec, lists the old to new addresses, and ends with the attribution line.
