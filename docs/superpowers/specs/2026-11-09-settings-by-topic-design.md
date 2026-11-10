# Settings by topic

Decided November 9, 2026. This is the first of two passes on settings. This pass regroups the cards into pages by topic and changes the navigation to match. The second pass fixes how settings look. The plan is in `docs/superpowers/plans/`, once it's written.

## Why

Settings has 49 cards in four tabs: You (12), Household (16), Import and export (3) and This server (18). Each tab is one long page with its own "On this page" jump list, so there are two kinds of navigation, and Household and This server are 16 and 18 cards long for someone who runs the server.

The same subject is split across tabs with nothing linking the halves. AI, nutrition, photos and stores each appear under both Household and This server. On most self-hosted installs one person is both admins and has to guess which tab to open. Import and export takes a whole tab for 3 cards. "Sharing" means two things: Share to Merran under You, and recipe links under Household.

Three layouts were compared with clickable mockups: a sidebar of pages grouped by who a setting affects, more top tabs, and pages by topic. Pages by topic won, because everything about one subject is in one place. To keep a server setting from being changed by mistake, a page that has both household and server settings shows one half at a time, with a switch.

## The pages

Ten pages, in this order. Seven of them have a Whole server half, which only the server admin sees.

| Page | Address | This household, or You | Whole server |
| --- | --- | --- | --- |
| Profile | `/settings/profile` | Profile, Language, Appearance, Your data | |
| Sign-in | `/settings/sign-in` | Password, Passkeys, Two-step sign-in, Single sign-on (You) | Authentication |
| Apps and devices | `/settings/apps` | Merran on this device, Share to Merran, Connected apps, API keys (You) | OAuth applications |
| Household | `/settings/household` | Household details, Members, Invitations | Start another household |
| Planning | `/settings/planning` | Planning, Tastes, Theme nights, Plan each week, Calendar subscriptions | |
| Recipes | `/settings/recipes` | Nutrition for the library, AI photos, Recipe links | Nutrition, AI photos, Voice |
| AI | `/settings/ai` | AI | AI keys, Who may use the server's AI, Spent |
| Shopping and stores | `/settings/shopping` | Pantry, Your stores, Stores | Kroger, Walmart |
| Import and export | `/settings/import-export` | Export this household, Import a Merran export, From another app | Recipe sites, Video import, FlareSolverr |
| Server | `/settings/server` | | This server, Email, Jobs, Error tracking, Telemetry |

Each card moves as it is. No card is split, merged or reworded in this pass, apart from the page and half names around them.

Three placements were choices rather than obvious:

- OAuth applications sits on Apps and devices, beside Connected apps, since one is the server's list of apps and the other is yours.
- Recipe sites, Video import and FlareSolverr sit under Import and export, since they're how recipes come in. Recipe sites also feeds starter collections, so this is a judgment call.
- Start another household is the Whole server half of Household, since only the server admin can do it.

## The switch

On a page with two halves, a switch at the top reads **This household** | **Whole server**, or **You** | **Whole server** on Sign-in and Apps and devices.

- The switch appears only when both halves are visible. That's only ever for the server admin.
- The Whole server half is tinted in its own color, and starts with the line "Changes here reach every household on this server."
- Each half has its own address: `/settings/ai` and `/settings/ai/server`, and so on. The switch is a pair of links.
- A page opens on its first visible half. Moving to another page opens that page's first half. A link that points at a server setting, such as the update notice or the household AI card's pointer to server keys, goes straight to the server half's address.
- If someone who isn't the server admin opens a server half's address, they're sent to the page's other half, or to `/settings` if there isn't one.

## Navigation

- **Larger screens:** the ten pages are a flat list in the column where "On this page" is now. The app's own sidebar doesn't change. The jump lists go, since no page is longer than 6 cards.
- **Phones** (below 768 pixels, the app's `useIsMobile`): `/settings` is the list of pages, each with a one-line summary of what's on it. A page opens with a back link to the list. The pill tabs and the scrolling row of section chips go.
- `/settings` on a larger screen goes to the first visible page, which is Profile.

This pass changes only as much layout as the regroup needs. The second pass decides how it looks, including whether the settings list should replace the app's sidebar while you're in settings.

## Who sees what

The rules for each card don't change. A page appears when at least one of its halves does.

| Half | Who sees it |
| --- | --- |
| You (Profile, Sign-in, Apps and devices) | Everyone |
| This household, on Household and Planning | Everyone in the household. Some cards inside stay for admins only, as now |
| This household, on Recipes, AI, Shopping and stores, and Import and export | Household owners and admins |
| Whole server | The server admin |

So a member sees 5 pages, a household admin 9, and the server admin all 10. Two cases to keep working:

- A server admin who is only a member of the household they're in sees Recipes, AI, Shopping and stores, and Import and export with only their Whole server half, opened directly and with no switch.
- Someone with no household sees Profile, Sign-in and Apps and devices. A server admin with no household also sees Household with only its Whole server half (Start another household), which replaces today's empty Household tab, along with the other server halves and Server.

## How it's built

- **One list of pages:** `apps/web/src/features/settings/pages.ts` names each page: its address, its words in `en.json`, and its halves with who sees each one. A pure function takes the signed-in person (`me` and the active household's role) and returns the pages and halves they can see. The settings layout's list, the phone list, the switch and the redirects all read from it. A unit test in the web app's `node --test` list covers a member, a household admin, the server admin, a server admin who is a member, and someone with no household.
- **Routes:** each page with two halves is a folder under `apps/web/src/routes/_app/settings/`, with `index.tsx` for its first half and `server.tsx` for the Whole server half. Pages with one half are a single file. Each half's loader loads only what its own cards need, as the four tabs do now. Server halves and admin-only halves check access in `beforeLoad` and redirect as described above.
- **The layout:** `routes/_app/settings.tsx` renders the page list beside the outlet on larger screens. `routes/_app/settings/index.tsx` shows the list on a phone and redirects to the first visible page otherwise. The page's heading, description and switch come from one shared component, which replaces `SettingsPage` and its jump list.
- **Kroger:** the `?kroger=` and `?reason=` search handling moves from the Household tab to `/settings/shopping`, and the server's Kroger callback (`apps/server/src/http/routes/stores/kroger/callback/get.ts`) sends people there.
- **Old addresses:** `/settings/you` redirects to `/settings/profile`. `/settings/household`, `/settings/import-export` and `/settings/server` are pages again under the same names, so they need nothing. A `/settings/household?kroger=…` link from before the change still lands on Household, which is acceptable: Kroger's return is a single moment, and the server sends people to the new address from now on.

## Everything else that changes with it

All in the same pull request, as `AGENTS.md` asks:

- **Words:** page names, page descriptions, the half names and the server line in `en.json`. Remove the old group keys (`settings.*.groups`, `settings.*.tab`). The settings tour's text (`help.tours.settings` and `help.tours.shared.server-settings`) describes You, Household and This server and needs rewriting. Its stops move to the page list and, for the server admin, the Server entry in it, since the first page (Profile) has no switch (`data-tour` attributes in the page list).
- **Links in the app** that point into settings, each to its new page or half:
  - `features/server/updates.tsx`, to `/settings/server`
  - `features/today/welcome.tsx` and `features/onboarding/optional-setup.tsx`
  - `features/ai/needs-ai.tsx`, to `/settings/ai`
  - `features/ai/household-ai-card.tsx`, to `/settings/ai/server`
  - `features/plan/not-filled.tsx`, to `/settings/planning`
  - `features/stores/kroger-basket-page.tsx`, to `/settings/shopping`
  - `features/household/new-household-card.tsx`
  - `features/account/sso-card.tsx`, whose sign-on return becomes `/settings/sign-in`
  - `routes/_focus/extension/connect.tsx`
- **Server:** the Kroger callback's redirect and its tests in `stores.test.ts`. The OpenAPI example `callbackURL: "/settings/you"` in `apps/server/src/http/auth/methods.ts` becomes `/settings/sign-in`, which means regenerating `openapi.json` and both `schema.d.ts` files. Check `web-app.test.ts` and `oidc.test.ts`, which use `/settings/you` as a sample address.
- **Guides:** about 27 pages on the site quote settings paths, such as "Settings → This server → Email" and "Settings → You → API keys". They become the new paths, quoting the labels exactly: "Settings → Server → Email", "Settings → Apps and devices → API keys", "Settings → AI → Whole server". The site's link check catches any page address that no longer exists.
- **`docs/features.md`:** rewrite the two settings rows ("Settings grouped by owner and task, with section links", and "Settings for the server, the household and you, kept apart"), and update the rows that quote a settings path (updates, nutrition, Find at your stores, Kroger, Language).

Nothing changes in the API's routes, the database, or how server settings are stored and set.

## Not in this change

- How settings look: card design, spacing, the page list's styling, and whether it replaces the app's sidebar. That's the second pass.
- Rewording cards, or splitting and merging them.
- A search box for settings.

## Checking it

- `pnpm typecheck`, `pnpm format:check`, `pnpm --filter @merran/web test` (with the new pages test), `pnpm --filter @merran/web check:locales`, `pnpm --filter @merran/server test`, and `pnpm docs:build`, which checks every link.
- In the dev server, as a member, a household admin and the server admin, on a desktop and a phone width: every card appears exactly once, the switch appears only for the server admin, each page's first half opens by default, a server half's address sends a member away, the old addresses land, and linking a Kroger account comes back to Shopping and stores.
