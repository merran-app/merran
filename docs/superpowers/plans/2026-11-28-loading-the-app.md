# Loading the app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slice 8, the last of the speed work: the web app opens faster and moves between pages faster. Each page's data starts with its code, the household comes with the sign-in check, Today asks for the plan once and gets one summary, a bar shows while a page loads, the first load carries less in fewer files, Fraunces loads only the axes it shows, onboarding stops asking and saving on every move, and the live stream stays open from page to page.

**Architecture:** Web: route loaders that start a page's queries without throwing, the household fetched alongside the sign-in check, a pure household clock that loaders and pages share, a progress bar on the router's pending state, `@merran/shared` marked free of side effects, and Rolldown code-splitting groups with a size budget checked by every build. Server: `GET /api/today` (Today's summary), `PUT /api/events/page` (the page open, told over a stream that stays open), onboarding that remembers progress as it's read, and fewer areas announced per recipe write.

**Tech Stack:** Vite 8.3 on Rolldown 1.2 (`build.rolldownOptions.output.codeSplitting`), TanStack Router 1.170 (loaders, `loaderDeps`, `defaultPreloadStaleTime`), TanStack Query 5.108, `@fontsource-variable/fraunces` 5.3, Hono with OpenAPI, MikroORM 7.2, vitest (server), node:test (web).

**Branch:** `perf/loading`, made from this worktree's branch, which has the plan.

**Spec:** [docs/performance.md](../../performance.md): slice 8's row in The plan, the findings under [The web app](../../performance.md#the-web-app) from "`@merran/shared` is one 109 KB chunk" on, and what slice 1 left there (announcing fewer areas, and keeping the stream open across pages). Decisions 11 to 14 in its [Decisions](../../performance.md#decisions) table were decided on November 28, 2026: Fraunces with weight and optical size and the wordmark drawn as SVG (Task 3); fewer areas per recipe write, in this slice (Task 11); pages that show at once, with skeletons, rather than waiting for their data (Tasks 6 and 7); and a size budget in every build (Task 2).

## Measured (November 28, 2026)

From `pnpm --filter @merran/web build` on main (d73a82c0), with a manifest and source maps. A "signed-in first load" is the entry, its static imports, the signed-in layout's chunk and the page's chunk with theirs, as slice 1 measured it (slice 1 ended at 110 files and 350 KB with Brotli for the entry and the layout; that part is now 114 and 356 KB). Brotli and gzip sizes are the build's own `.br` and `.gz` files.

| | Main now | With `"sideEffects": false` | And small chunks grouped (Task 2) |
|---|---|---|---|
| JS files in the build | 271, 137 under 2 KB | 277, 139 under 2 KB | 170, 73 under 2 KB |
| Today's signed-in first load | 152 files (93 under 2 KB), 1,376 KB, 480 KB gzip, **424 KB Brotli** | 152 files, 1,273 KB, 448 KB gzip, 397 KB Brotli | **55 files, 1,267 KB, 411 KB gzip, 356 KB Brotli** |
| The library's first load | 159 files, 428 KB Brotli | 159 files, 400 KB | 60 files, 358 KB |
| The plan's first load | 143 files, 403 KB Brotli | 142 files, 375 KB | 53 files, 354 KB |
| Then the library, after Today | 17 more files, 23 KB | 17, 23 KB | 12, 19 KB |
| Then the plan | 7, 16 KB | 7, 16 KB | 7, 14 KB |
| Then the list | 22, 46 KB | 26, 72 KB | 20, 66 KB |
| Then a recipe | 18, 31 KB | 23, 57 KB | 19, 53 KB |
| Foods vocabulary in the first load | Yes | No | No |

- **`@merran/shared` is one chunk** (`src-*.js`, 111 KB, 30 KB with Brotli) holding all 32 of the package's modules, and the entry preloads it because `i18n.ts` imports `LOCALES`. The package doesn't say it's free of side effects, so importing anything from its barrel keeps every module; 80 KB of the chunk's source is the foods vocabulary (`foods/data/foods.ts` and `en.ts`). None of the shared code runs anything on import beyond filling its own module's maps (`ingredients/parse.ts`).
- **Small files:** 35 are single icons from `@hugeicons/core-free-icons`, 34 of them under 2 KB. The rest are small app and library modules that different sets of pages share.
- **Fonts:** Fraunces is `full.css`: 121 KB for Latin, plus 105 KB (Latin Extended) and 34 KB (Vietnamese) when a page has those letters. Figtree is 20 KB and 10 KB. The CSS is 168 KB (26 KB gzip).
- **Groupings tried** (Today's first load, files and KB with Brotli, all with `sideEffects: false`): icons alone 130 / 398. Icons and every library, grouped by the pages that use them: 99 / 397, but the library page then needs 142 KB more. Everything at least two pages share, small groups merged into a neighbour at 4, 8 or 16 KB: 86 / 450, 69 / 476, 53 / 479. One common chunk of everything that 4, 8 or 16 pages share: 24 / 375, 43 / 371, 54 / 360, but at 4 and 8 the vocabulary comes back into the first load, with the components that import it. **Libraries and the app's UI primitives (`src/components/ui`, `src/lib`) that 2, 4 or 8 pages share: 53 / 402, 55 / 356, 59 / 356.** Task 2 uses 4.

## Decided while planning (November 28, 2026)

For the user to confirm with the plan:

1. **`@merran/shared` is split by use by saying it has no side effects** (`"sideEffects": false` in its `package.json`), not with new entry points: no import changes anywhere, and each page keeps only the shared code it uses. The vocabulary goes with the list, the pantry and the recipe pages.
2. **Small chunks are grouped with Rolldown's `codeSplitting` groups:** icons by the pages that use them (sets under 16 KB merged), and one common chunk for the libraries and UI primitives that at least four pages share.
3. **The household is fetched alongside the sign-in check,** not added to `/api/auth/me`: no API change, and the two requests go at once.
4. **Today's summary is one new route, `GET /api/today`,** open to API keys as the live stream is: each part (`list`, `pantry`, `recipes`) is null for a key that can't read its area. It shows what Today shows now, worked out the same way: cook again is chosen from the 48 best rated by `cookAgain`.
5. **Today asks for its summary each time it opens,** in the background while the last one shows (`staleTime: 0`), so what you changed on another page is right on Today. Other people's and other devices' changes come over the live stream.
6. **Loaders start a page's data and don't wait for it** (decision 13): Today, the library and the plan show at once with the skeletons they have, and fill in as their data comes. Their loaders start the queries alongside the page's code (`preloadQuery`, which never throws, so a page whose data fails still opens and shows its own error or empty state, as now). The pages that wait already (the list, the pantry, a recipe, its editor and cook view, Settings) are drawn from loaded data, with no skeletons, so they keep their `ensureQueryData` loaders and wait, with the progress bar.
7. **Reading onboarding remembers new progress** (at most four writes per household, ever) and counts only what isn't remembered yet. The web app stops sending `recordProgress`, which the API still takes.
8. **The live stream stays open while someone's signed in,** across the app's pages and the cook view. The page open is told with `PUT /api/events/page`, so who's on the list or the plan changes at once, without connecting again.
9. **Nothing breaks:** two new routes, no changed ones. The pull request's title is `perf:`.

## Global Constraints

- Every rule in `AGENTS.md`: words people read in `apps/web/src/locales/en.json`; logical classes (`start-0`, `ms-*`, `text-start`); drawers, not dialogs, on phones (no new overlays here); files in folders; routes mirror the API (`GET /api/today` is `apps/server/src/http/routes/today/get.ts`, `PUT /api/events/page` is `apps/server/src/http/routes/events/page/put.ts`, each folder's `index.ts` registering them); readable, expanded code; plain-English comments that say why.
- **No new dependencies.** Fonts come from the installed `@fontsource-variable/fraunces`; the wordmark's outline (Task 3) is made once in the scratchpad, with Python tools that aren't committed.
- **Behaviour stays the same** unless a decision says otherwise: every existing test passes unchanged, except where a task names a test it changes.
- **Prettier** from the root, on named folders (`pnpm exec prettier --write apps/web apps/server packages/shared`) or `pnpm format`. Never on `docs/`.
- **After an API change:** `pnpm --filter @merran/server openapi`, then in PowerShell, with plain `pnpm`: `$env:pnpm_config_cache_dir = "D:\Development\Mise\.local\pnpm-cache"; pnpm --filter @merran/web api; pnpm --filter @merran/extension api`. Both `schema.d.ts` files must match.
- **Focused server tests:** `pnpm --filter @merran/server exec vitest run --project sqlite <path>`. Postgres runs in CI.
- **Web tests** are node:test files listed by name in `apps/web/package.json`'s `test` script: add each new one there. They import relative `.ts` files, never `@/` paths, so what they test lives in files that don't import `@/`.
- **Numbers fixed here:** the progress bar shows after **200 ms** of loading, grows to **85%** over **8 s**, and fades in **200 ms**. The common chunk takes what at least **4** pages share; icon sets under **16 KB** merge. The budget (decision 14): Today's signed-in first load at most **70 files** and **380,000 bytes** with Brotli, with nothing from `packages/shared/src/foods/data/`.
- **Browser checks** use the user's dev servers as the Claude admin of "The Johnsons" on `http://127.0.0.1:5173`, never `localhost:5173`. A production build is checked with `vite preview` from `apps/web` (port 4173, `--host 127.0.0.1`; it proxies `/api` to the dev API on :3000 as the dev server does), started from a temporary `.claude/launch.json` entry, not Bash, and the entry taken out after. A flow that needs a new household uses a throwaway API with its own data folder, as the dev-household notes describe.

## Review Focus

1. **Someone signed out, or asked for a second factor.** The household request now goes out with the sign-in check: it must not hold up the redirect to sign in, setup or verify, and its refused answer mustn't stop the household loading once they've signed in. Checked in Task 4's browser steps.
2. **Typing in the library's search.** A loader runs for every change of search; the page must never wait on the router for its own search or filter changes, or the box would lag and the bar would flash. The library's loader returns without waiting (Task 7), checked in Task 7's browser steps.
3. **Today after a change made elsewhere on this device.** Live events don't come back to the device that made the change, so checking things off the list and going back to Today must still show the new count. `staleTime: 0` in Task 6, checked in its browser steps.
4. **Presence when the page changes before the stream is open, or while it's reconnecting.** The page told by `PUT` is lost if no stream is open; the next connection must carry the page open then. Pinned in Task 10.
5. **Grouped chunks loading in the wrong order.** Moving modules into a common chunk changes which file defines what; a page could fail with "Cannot access … before initialization" only in a production build. Task 2 opens every main page from a production build.

---

### Task 1: `@merran/shared` by use

**Files:**
- Modify: `packages/shared/package.json`

- [ ] **Step 1: Confirm the baseline.** Run `pnpm --filter @merran/web build`. `grep -l 168472 apps/web/dist/assets/*.js` (a USDA id only `foods/data/foods.ts` has) names one chunk, and `apps/web/dist/index.html` has a `modulepreload` for it.
- [ ] **Step 2: Add `"sideEffects": false`** to `packages/shared/package.json`, after `"type"`.
- [ ] **Step 3: Build again.** The chunk with `168472` is no longer in `dist/index.html`. Then `pnpm --filter @merran/shared test`, `pnpm --filter @merran/web typecheck`, and `pnpm --filter @merran/extension build` and `build:firefox`: all pass.
- [ ] **Step 4: Check in the dev server:** type "2 cups flour" on the list (it lands in its aisle, with its food), open a recipe and scale it, and open the pantry. Nothing in the console.
- [ ] **Step 5: Commit:** "Say the shared code has no side effects, so each page loads only the parts it uses".

### Task 2: Small chunks grouped, with a budget the build checks

Decision 14: the budget, with the limits recommended.

**Files:**
- Create: `apps/web/build/budget.ts`, `apps/web/build/budget.test.ts`
- Modify: `apps/web/vite.config.ts`, `apps/web/package.json` (test list)

**Interfaces:**
- Produces, in `budget.ts`:
  - `type BuiltChunk = { fileName: string; isEntry: boolean; facadeModuleId: string | null; imports: string[]; moduleIds: string[] }`, the parts of Rolldown's `OutputChunk` it reads.
  - `type Budget = { files: number; brotliBytes: number; forbidden: RegExp }`.
  - `TODAY_FIRST_LOAD = ["src/routes/_app.tsx?tsr-split=component", "src/routes/_app/index.tsx?tsr-split=component"]` and `FIRST_LOAD_BUDGET: Budget = { files: 70, brotliBytes: 380_000, forbidden: /packages[\\/]shared[\\/]src[\\/]foods[\\/]data[\\/]/ }`.
  - `firstLoad(chunks: BuiltChunk[], routes: string[]): BuiltChunk[]`: the entry chunk, each chunk whose `facadeModuleId`, with `\` turned to `/`, ends with one of `routes`, and every chunk they import statically, each once.
  - `budgetProblems(load: BuiltChunk[], brotliSize: (fileName: string) => number, budget: Budget): string[]`: one sentence per broken limit, saying the number and the limit, and naming each file holding a forbidden module.
  - `budgetPlugin(): Plugin`: `apply: "build"`; keeps the chunks in `generateBundle`; in `closeBundle`, after `precompressPlugin`'s, takes each first-load file's size from its `.br` beside it in `outDir` (the file's own size when there's none, as for files under 1 KB), logs "Today's first load: 55 files, 356 KB with Brotli", and fails the build with the problems.

- [ ] **Step 1: Write the failing tests** in `budget.test.ts`, on hand-made chunks: an entry importing `a.js`; the `_app` route (`facadeModuleId` `D:\x\apps\web\src\routes\_app.tsx?tsr-split=component`) importing `b.js`; Today's route importing `c.js`, which imports `a.js`; and another route, `d.js`.
  - `the first load is the entry, the routes and what they import`: `firstLoad(chunks, TODAY_FIRST_LOAD)` gives the entry, `a`, `b`, `c` and both routes, without `d`.
  - `a chunk imported twice is counted once`: `a.js` appears once.
  - `a load within the budget has no problems`: `[]`.
  - `too many files says how many`: 71 chunks gives one problem containing "71" and "70".
  - `too big says how big`: sizes adding up to 380,001 gives one problem containing "380".
  - `the foods vocabulary says which file has it`: a chunk whose `moduleIds` has `D:/x/packages/shared/src/foods/data/foods.ts` gives a problem naming that chunk's `fileName`.
- [ ] **Step 2: Run them** and check they fail: `node --test apps/web/build/budget.test.ts`.
- [ ] **Step 3: Implement `budget.ts`.** Add the test to `apps/web/package.json`.
- [ ] **Step 4: Run the tests** and check they pass.
- [ ] **Step 5: Group the chunks** in `vite.config.ts`, under `build.rolldownOptions.output.codeSplitting`, with a comment on each group saying why:

```ts
groups: [
  // An icon is a file of its own otherwise: one per set of pages.
  {
    name: "icons",
    test: /[\\/]@hugeicons[\\/]core-free-icons[\\/]/,
    priority: 2,
    entriesAware: true,
    entriesAwareMergeThreshold: 16 * 1024,
  },
  // Libraries and UI primitives most pages use, in one file. Not the
  // app's features: those bring the foods vocabulary in with them.
  {
    name: "common",
    test: /[\\/]node_modules[\\/]|[\\/]src[\\/](components[\\/]ui|lib)[\\/]/,
    priority: 1,
    minShareCount: 4,
  },
],
```

  Add `budgetPlugin()` after `precompressPlugin()`.
- [ ] **Step 6: Build.** It passes and logs about 55 files and 356 KB (the budget's limits are 70 and 380 KB); `dist/assets` has about 170 JS files. Note the numbers for the pull request.
- [ ] **Step 7: Check the production build in a browser** (Review Focus 5): `vite preview` as in Global Constraints, signed in as the Claude admin. Open Today, the library, a recipe, its cook view, the plan, the list, the pantry, Settings and the assistant, each by a link and each by a reload. Every page draws, with nothing in the console.
- [ ] **Step 8: Commit:** "Group small chunks, and check the first load's size in every build".

### Task 3: Fraunces with only the axes it shows

Decision 11: weight and optical size, with the wordmark drawn as SVG.

**Files:**
- Create: `apps/web/src/components/brand/wordmark.tsx`
- Modify: `apps/web/src/components/brand/logo.tsx`, `apps/web/src/index.css`

**Interfaces:**
- Produces: `Wordmark({ className }: { className?: string })`: an inline SVG of "merran" as Fraunces draws it now, at weight 500, optical size 24 and SOFT 100, with `tracking-tight`. Two paths: the "a" in `fill-primary`, the rest in `fill-foreground`. `aria-hidden`, with "merran" in an `sr-only` span beside it, so screen readers read what they read now.

- [ ] **Step 1: Make the outline once, in the scratchpad.** A Python venv with `fonttools`, `brotli` and `uharfbuzz`. Instance `node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2` with `fontTools.varLib.instancer.instantiateVariableFont` at `{"wght": 500, "opsz": 24, "SOFT": 100, "WONK": 0}`. Shape "merran" with `uharfbuzz` on that instance, so kerning matches the browser's, adding −0.025 em of tracking after each letter (`tracking-tight`). Draw each glyph with `fontTools.pens.svgPathPen.SVGPathPen`, moved to its position and flipped (font units go up, SVG's go down). The viewBox is the advance width by one em (`unitsPerEm`), from `hhea.ascent` down, so the SVG sits where `leading-none` text sat. Keep the script in the scratchpad; commit only the paths.
- [ ] **Step 2: Write `Wordmark`,** 1em tall (`h-[1em] w-auto`), and use it in `Logo` in place of the text span, keeping `text-2xl` on its wrapper so it's the same size.
- [ ] **Step 3: Load the smaller font.** In `index.css`, `@import "@fontsource-variable/fraunces/standard.css";` in place of `full.css`.
- [ ] **Step 4: Build.** `dist/assets` has `fraunces-latin-standard-normal-*.woff2` (67 KB) and no `-full-` files.
- [ ] **Step 5: Compare in the dev server,** with screenshots before (from main) and after: the sidebar's logo, the sign-in page's logo, Today's greeting, a recipe's title, and a settings page's headings, at 100% and 200% zoom, light and dark. Nothing moves or changes shape.
- [ ] **Step 6: Commit:** "Load Fraunces with only weight and optical size, and draw the wordmark as it was".

### Task 4: The household with the sign-in check, and loaders that don't throw

**Files:**
- Create: `apps/web/src/features/plan/clock.ts`, `apps/web/src/features/plan/clock.test.ts`, `apps/web/src/lib/loaders.ts`, `apps/web/src/lib/loaders.test.ts`
- Modify: `apps/web/src/features/auth/require-signed-in.ts`, `apps/web/src/features/plan/queries.ts` (`useHouseholdClock`), `apps/web/src/main.tsx`, `apps/web/package.json` (test list)

**Interfaces:**
- Produces, in `clock.ts` (imports only `@merran/shared`):
  - `type HouseholdClock = { today: string; hour: number; weekStartsOn: number; meals: Meal[]; thisWeek: string }`, what `useHouseholdClock` returns now.
  - `clockOf(household: { timeZone: string; weekStartsOn: number; meals: Meal[] | null } | undefined, now?: Date): HouseholdClock`, with `useHouseholdClock`'s fallbacks: UTC, weeks from Monday, `plannedMeals(undefined)`.
  - `todayPlanRange(clock: HouseholdClock): { from: string; to: string }`: this week's first day to a week from today, as Today asks now.
  - `weekShown(asked: string | undefined, clock: HouseholdClock): { from: string; to: string }`: the week of the day asked, or this week, first day to seventh, as the plan page asks now.
- Produces, in `lib/loaders.ts` (imports only `@tanstack/react-query`):
  - `preloadQuery(queryClient: QueryClient, options: Parameters<QueryClient["ensureQueryData"]>[0]): Promise<void>`, taking the `queryOptions(...)` a page's query uses: `ensureQueryData`, settling whether it worked or not.
  - `preloadInfiniteQuery(queryClient: QueryClient, options: Parameters<QueryClient["ensureInfiniteQueryData"]>[0]): Promise<void>`: the same with `ensureInfiniteQueryData`.
- `useHouseholdClock()` becomes `clockOf(useQuery(householdQuery).data)`.

- [ ] **Step 1: Write the failing tests.**
  - `clock.test.ts`: `the clock is the household's` (`{ timeZone: "Pacific/Auckland", weekStartsOn: 1, meals: ["dinner"] }` at `2026-11-28T20:00:00Z` gives today `2026-11-29`, hour 9, `thisWeek` `2026-11-23`, meals `["dinner"]`). `without a household it's UTC, from Monday` (today `2026-11-28`, `thisWeek` `2026-11-23`). `Today's plan runs from the week's first day to a week from today` (that Auckland clock gives `2026-11-23` to `2026-12-06`). `the plan shows the week of the day asked, or this week` (`"2026-12-03"` gives `2026-11-30` to `2026-12-06`; `undefined` gives `2026-11-23` to `2026-11-29`).
  - `loaders.test.ts`, with a real `QueryClient` (`retry: false`): `a preload that fails doesn't throw` (resolves; the query is in error). `a preload keeps what it loaded` (the data is in the cache). `an infinite preload keeps its first page` (the same for `preloadInfiniteQuery`).
- [ ] **Step 2: Run them** and check they fail.
- [ ] **Step 3: Implement** `clock.ts` and `loaders.ts`, and `useHouseholdClock` on `clockOf`. Add both tests to `package.json`.
- [ ] **Step 4: The household with the sign-in check.** In `requireSignedIn`, start `queryClient.prefetchQuery(householdQuery)` before awaiting `meQuery`, so they go together. Once `me` is someone signed in without a second factor to give, await the household's before returning. Anyone else is redirected at once; `prefetchQuery` never throws, and a refused household answer is fetched again once they're signed in, since it has no data.
- [ ] **Step 5: Let Query keep the data.** `defaultPreloadStaleTime: 0` in `createRouter` (`main.tsx`), with a comment: the router asks each loader every time, and the loader answers from Query's cache at once when it has the data.
- [ ] **Step 6: Run the web tests and typecheck.**
- [ ] **Step 7: Check in a browser** (Review Focus 1). As the Claude admin on `127.0.0.1:5173`: reload Today. `/api/auth/me` and `/api/households/current` start together, and `/api/plan` goes once, for the household's week (before, twice). Sign that session out (only the Claude session on 127.0.0.1): `/` goes to sign in, with no error. Sign in: Today shows the household's day.
- [ ] **Step 8: Commit:** "Load the household with the sign-in check, so pages know its clock from the start".

### Task 5: One summary for Today

**Files:**
- Create: `apps/server/src/services/today/summary.ts`, `apps/server/src/http/schemas/today.ts`, `apps/server/src/http/routes/today/get.ts`, `apps/server/src/http/routes/today/index.ts`, `apps/server/src/http/routes/today/today.test.ts`
- Modify: `apps/server/src/http/routes/index.ts` (register it), `apps/server/src/http/openapi/document.ts` (a `Today` tag), `packages/shared/src/pantry/pantry.ts`, `apps/web/src/features/pantry/use-soon.ts`, `openapi.json` and both `schema.d.ts`

**Interfaces:**
- Produces, in shared: `useSoonOrder(soon: { kind: "past" | "soon" | "leftover"; date?: string }): number`, moved from the web's `urgency` unchanged (past dates, then by date, then leftovers). `use-soon.ts` uses it in place of `urgency`.
- Produces, in `summary.ts`: `todaySummary(em: EntityManager, householdId: string, readable: ReadonlySet<"list" | "pantry" | "recipes">): Promise<TodaySummary>`, where:

```ts
type TodaySummary = {
  /** What's left to buy: how many, the first three, and the meals it's for. */
  list: { toBuy: number; names: string[]; meals: string[] } | null
  /** What to use soon, most urgent first, and what's set aside for each meal. */
  pantry: {
    useSoon: PantryItem[]
    meals: { id: string; names: string[] }[]
  } | null
  /** How many recipes, the six newest, and up to six to cook again. */
  recipes: {
    total: number
    recent: RecipeSummary[]
    cookAgain: RecipeSummary[]
  } | null
}
```

  - `list`, from `getList`: the unchecked items in its order. `toBuy` is how many, `names` the first three names, and `meals` the ids of the plan entries they're for, each once.
  - `pantry`, from `getPantry`: the items with `useSoon`, sorted by `useSoonOrder` (ties keep the pantry's order); and for each plan entry an item is set aside for, up to four of those items' names, in the pantry's order.
  - `recipes`: `listRecipes(em, { sort: "newest", limit: 6, offset: 0 })` gives `recent` and `total`; `cookAgain` is shared's `cookAgain` over `listRecipes(em, { sort: "rating", limit: 48, offset: 0 }).recipes` and the household's today (`clockIn(household.timeZone).today`).
  - A part whose area isn't in `readable` is `null`, and isn't read.
- Produces the route `GET /api/today`, `operationId: "getToday"`, tag `Today` (added to `document.ts`: "What Today shows at a glance: what's left to buy, what to use soon, and recipes to cook again, in one request."), `...OPEN_TO_READERS`, with `readingHousehold(c, ["list", "pantry", "recipes"])` for what a key can read, as `GET /api/events` does. The schema is `TodaySchema`, `.openapi("Today")`, reusing `PantryItemSchema` and `RecipeSummarySchema`.

- [ ] **Step 1: Write the failing tests** in `today.test.ts`, with the helpers the list, pantry and plan route tests use:
  - `counts what's left to buy and names the first three`: four typed items, one checked: `toBuy` 3, `names` the first three unchecked, in the list's order.
  - `says which meals are on the list, and what's home for them`: a planned recipe meal listed (`POST /api/list/for-meals`, as the list tests do), with one of its foods in the pantry set aside for it: `list.meals` has the entry's id, and `pantry.meals` has `{ id: entry.id, names: [that item's name] }`.
  - `puts what to use soon most urgent first`: an item past its use-by date, one used by tomorrow, and a leftover come in that order.
  - `picks recipes to cook again as Today did`: recipes rated 5 made 30 days ago, 4 never made, 5 made 3 days ago and 3 never made: `cookAgain` is the first two, in that order; `recent` is the newest six and `total` every recipe.
  - `gives a key only what it can read`: a key with only `recipes:read` gets `list: null`, `pantry: null` and `recipes`.
  - `is only the household's own`: another household's items, pantry and recipes aren't counted.
- [ ] **Step 2: Run them** and check they fail: `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/today/today.test.ts`.
- [ ] **Step 3: Implement** `useSoonOrder`, the service, the schema and the route.
- [ ] **Step 4: Run the tests** and check they pass. Then `pnpm --filter @merran/shared test` and the pantry, list and plan route tests.
- [ ] **Step 5: Regenerate the API** (Global Constraints). Run `pnpm --filter @merran/server typecheck` and `pnpm --filter @merran/web typecheck`.
- [ ] **Step 6: Commit:** "Add one summary for Today: what's left to buy, what to use soon, and what to cook again".

### Task 6: Today on its summary, with a loader

Decision 13: Today shows at once, with its skeletons, and its loader starts its data without waiting for it.

**Files:**
- Modify: `apps/web/src/features/today/queries.ts`, `today-page.tsx`, `glance.tsx`, `shelves.tsx`, `did-you-make.tsx`, `apps/web/src/routes/_app/index.tsx`, `apps/web/src/features/live/state.ts`, `apps/web/src/features/live/state.test.ts`

**Interfaces:**
- Consumes: `GET /api/today` (`Schemas["Today"]`), `clockOf` and `todayPlanRange`, `preloadQuery`.
- Produces, in `features/today/queries.ts`: `todayQuery`, `queryOptions({ queryKey: ["today"], queryFn: …GET /api/today, staleTime: 0 })`, with a comment saying why it's always asked again (Review Focus 3); `unmarkedQuery`, moved here from `did-you-make.tsx` unchanged; `type TodaySummary = Schemas["Today"]`. `recentRecipesQuery` and `topRatedQuery` go.
- `LIVE_REFRESH` gains `["today"]` in `list`, `pantry`, `recipes` and `plan`.

- [ ] **Step 1: Write the failing test** in `state.test.ts`: `Today's summary is refreshed by the list, the pantry, recipes and the plan` (each of those areas' keys includes `["today"]`, and `coveredByLive(["today"])` is true).
- [ ] **Step 2: Run it** and check it fails.
- [ ] **Step 3: Add `["today"]` to `LIVE_REFRESH`.**
- [ ] **Step 4: Today on the summary.** What shows doesn't change:
  - `TodayPage`: `useQuery(todayQuery)` in place of `recentRecipesQuery`; the welcome shows when `recipes.total` is 0.
  - `UpNext`: on the list when `list.meals` has the entry's id; what's home is `pantry.meals`' names for it.
  - `Glance`: the list tile from `list.toBuy` and `list.names`; the pantry tile from `pantry.useSoon` (its first item and how many), with `missedMeal` as now.
  - `Shelves`: `recipes.cookAgain` and `recipes.recent`, with the skeleton while the summary loads.
  - A part that's `null` shows as empty.
- [ ] **Step 5: Today's loader**, in `routes/_app/index.tsx`: the clock from the household already loaded (`clockOf(queryClient.getQueryData(householdQuery.queryKey))`) and `{ from, to } = todayPlanRange(clock)`, then start `preloadQuery` of `planQuery(from, to)`, `todayQuery`, `unmarkedQuery` and `autoplanQuery`, all at once, and return without waiting for them (a comment says why: decision 13).
- [ ] **Step 6: Run the web tests and typecheck.**
- [ ] **Step 7: Check in a browser,** against main's Today in the same household (screenshots before and after): the next meal with "On the list" and what's at home, the three tiles, Did you make these?, the days coming up and both shelves are the same. A reload of Today asks for `/api/today` and `/api/plan` once each, with no `/api/list`, `/api/pantry` or `/api/recipes`. Going to Today from another page shows it at once, with skeletons only where its data isn't cached yet. Then check something off on the list page and go back to Today: one fewer to buy. In a second tab (another client), add something to the list: the first tab's Today shows it within a few seconds.
- [ ] **Step 8: Commit:** "Draw Today from its summary, loaded with the page".

### Task 7: Loaders for the library and the plan

Decision 13, as in Task 6: both pages show at once with their skeletons, and their loaders start the data without waiting for it.

**Files:**
- Modify: `apps/web/src/routes/_app/recipes/index.tsx`, `apps/web/src/routes/_app/plan.tsx`, `apps/web/src/features/plan/plan-page.tsx`

**Interfaces:**
- Consumes: `preloadQuery`, `preloadInfiniteQuery`, `clockOf`, `weekShown`.

- [ ] **Step 1: The library's loader:** `loaderDeps: ({ search }) => search`, and a loader that starts `preloadInfiniteQuery(recipesQuery(deps))` and `preloadQuery` of `planQuery(from, to)` for this week (`weekShown(undefined, clock)`, with the clock from the household already loaded: what `usePlannedRecipes` asks for), and returns without waiting.
- [ ] **Step 2: The plan's loader:** `loaderDeps: ({ search }) => ({ week: search.week })`; the clock from the household already loaded; `weekShown(deps.week, clock)`; start `preloadQuery` of `planQuery(from, to)`, `calendarSettingsQuery`, `calendarSlotTimesQuery(from, to)` and `themesQuery`, and return without waiting. Its household loader goes. `PlanPage` takes its week from `weekShown` too, so the two always agree.
- [ ] **Step 3: Typecheck.**
- [ ] **Step 4: Check in a browser** (Review Focus 2). Hover the Recipes link: `/api/recipes?…` starts before the click. Type in the library's search: no bar, and the last results stay, dimmed, until the new ones come, as now. Change a filter and the sort: the same. Open the plan from Today: it shows at once, and `/api/plan`, the calendar's settings and slots, and the themes start together, alongside its code. Go to next week and back: as before.
- [ ] **Step 5: Commit:** "Start the library's and the plan's data with their code".

### Task 8: A bar while a page loads

**Files:**
- Create: `apps/web/src/components/layout/page-progress.tsx`
- Modify: `apps/web/src/routes/__root.tsx`, `apps/web/src/index.css`, `apps/web/src/locales/en.json`

**Interfaces:**
- Produces: `PageProgress()`, rendered once in the root route's component, above `<Outlet />`.

- [ ] **Step 1: Words.** `app.loadingPage`: "Loading the page".
- [ ] **Step 2: Implement `PageProgress`.** It reads `useRouterState({ select: (state) => state.status === "pending" })`. After 200 ms of pending it shows a 2 px bar fixed across the top of the window (`inset-x-0 top-0`, below the phone's status bar in the installed app: `top-[env(safe-area-inset-top)]`), `pointer-events-none`, above the page's top bar. Inside, a `bg-primary` bar anchored at `start-0` grows from nothing to 85% of the width over 8 s, easing out (a `page-progress` keyframe on `inline-size`, as `--animate-page-progress` in `index.css`). When the router is idle again, the bar fills and fades out over 200 ms, then goes. A load under 200 ms shows nothing. With reduced motion, it's a full-width bar at half opacity while loading, with no growth. `role="progressbar"`, `aria-label={t("app.loadingPage")}`, no value (it doesn't know how far along it is). Preloads never show it: they don't make the router pending.
- [ ] **Step 3: Check in a browser.** The router is pending while a page's code loads, and while a page that waits (the list, the pantry, a recipe, Settings) loads its data. Put a 2-second wait in the list's loader, for this check only. Click List: the bar appears after 200 ms, grows from the start edge, fills and fades when the list shows. With `dir="rtl"` on `<html>` (devtools), it grows from the right. With reduced motion emulated, it's a still bar. Take the wait out; loads on the dev server are quick enough that the bar doesn't show. Typing in the library's search never shows it.
- [ ] **Step 4: Run `pnpm --filter @merran/web check:locales` and `typecheck`.**
- [ ] **Step 5: Commit:** "Show a bar while a page loads".

### Task 9: Onboarding asks and saves only when it can change

**Files:**
- Create: `apps/web/src/features/onboarding/progress.ts`, `apps/web/src/features/onboarding/progress.test.ts`
- Modify: `apps/server/src/services/onboarding/status.ts`, `apps/server/src/http/routes/auth/me/onboarding/get.ts`, `patch.ts`, `onboarding.test.ts`, `apps/web/src/features/onboarding/onboarding-context.tsx`, `apps/web/package.json` (test list)

**Interfaces:**
- Produces, in `status.ts`:
  - `onboardingStatus(em, userId, householdId)`, its answer unchanged, now counting recipes, plan entries, list items and recipes made only for the steps the household hasn't remembered.
  - `rememberProgress(em: EntityManager, householdId: string): Promise<boolean>`: when a step is done (counted) but not remembered, saves it in the household's settings, in a transaction that locks the household as `PATCH` does now, and says whether it saved anything. With all four remembered it reads only the household. It and `onboardingStatus` count a step with one helper, so they can't disagree.
- `GET /auth/me/onboarding` calls `rememberProgress` before answering. `PATCH`'s `recordProgress` calls it too; its other changes stay as they are.
- Produces, in `progress.ts` (no `@/` imports): `checklistCanChange(onboarding: { dismissed: boolean; progress: Record<"recipe" | "plan" | "list" | "cook", boolean> } | undefined): boolean`: false when it isn't loaded, is dismissed, or has every step done.

- [ ] **Step 1: Write the failing server tests** in `onboarding.test.ts`: `reading it remembers progress` (add a recipe, `GET`; delete it for good; `GET` again: `progress.recipe` is still true, with no `PATCH`). `remembering twice saves nothing the second time` (`rememberProgress` is true, then false). `recordProgress still works` (the existing test, unchanged, passes).
- [ ] **Step 2: Write the failing web test** `progress.test.ts`: `a dismissed checklist can't change`, `a finished one can't`, `one with a step left can`, `one not loaded can't`.
- [ ] **Step 3: Run them** and check they fail.
- [ ] **Step 4: Implement the server side** in `status.ts` and the two routes.
- [ ] **Step 5: Implement the web side** in `onboarding-context.tsx`: no refetch when the path changes (the effect on `pathname` goes); the query cache listener is subscribed only while `checklistCanChange(query.data)`; no `recordProgress` save on load (that effect goes). Add the test to `package.json`.
- [ ] **Step 6: Run the tests** and check they pass. Then the whole onboarding test file, and `pnpm --filter @merran/web test`.
- [ ] **Step 7: Check in a browser.** In The Johnsons (every step done): moving between Today, the library, the plan and the list sends no `/api/auth/me/onboarding` request, and no `PATCH`. On a throwaway API's new household: add a recipe on the library page and go to Today: the checklist has it ticked, without a reload.
- [ ] **Step 8: Commit:** "Ask about onboarding only while the checklist can change, and remember progress as it's read".

### Task 10: The live stream stays open across pages

**Files:**
- Create: `apps/server/src/http/routes/events/page/put.ts`, `apps/server/src/http/routes/events/page/index.ts`, `apps/web/src/features/live/where.ts`, `apps/web/src/features/live/where.test.ts`
- Modify: `apps/server/src/services/events/events.ts`, `apps/server/src/http/routes/events/index.ts`, `apps/server/src/http/routes/events/events.test.ts`, `apps/web/src/features/live/live-updates.tsx`, `apps/web/src/routes/__root.tsx`, `apps/web/src/components/layout/app-shell.tsx`, `apps/web/package.json` (test list), `openapi.json` and both `schema.d.ts`

**Interfaces:**
- Produces, on the event bus: `movePage(householdId: string, who: { personId: string; client: string }, page: LivePage | null): number`: sets `page` on that person's listeners with that client (`Listener.page` is no longer fixed), sends presence for the page left and the page opened, and says how many listeners moved.
- Produces the route `PUT /api/events/page`, `operationId: "openPage"`, tag `Live`, `security: SESSION_SECURITY` (a key isn't a person on a page), body `{ client: string (1 to 64), page: "list" | "plan" | null }`, answering 204. Its description: "Says which page this device has open, on its live stream that's open already (the same `client`), so who's on the list or the plan changes without connecting again. A device with no stream open says its page when it connects." It announces nothing (`live.ts` has no rule for it).
- Produces, in `where.ts` (no `@/` imports): `pageOf(path: string): LivePage | null`, moved from `live-updates.tsx`; `liveWanted(routeIds: string[]): boolean`, true when `/_app` or `/_focus` is among the matched routes.
- `LiveUpdates({ children })` moves to the root route's component, around `<Outlet />`, and always provides the presence context. Inside it, `LiveConnection({ me, onPeople })` connects only while someone's signed in (`useQuery(meQuery).data`) and `liveWanted` holds. Its connecting effect depends on `me.id`, not the page: the page goes in the stream's address when it connects, from a ref holding the latest. When the page changes on a stream that's open, it sends `PUT /api/events/page` with `CLIENT_ID`, ignoring failures (the next connection carries the page). `AppShell` no longer wraps `<Outlet />` in it.

- [ ] **Step 1: Write the failing server tests** in `events.test.ts`:
  - `say who has moved to another page, without connecting again`: Kyle listens on the list (`client: "kyle-laptop"`); Jamie listens on the list from her phone and on the plan from her tablet. Kyle `PUT`s `{ client: "kyle-laptop", page: "plan" }`: 204. Jamie's list stream hears presence on the list with Jamie only, and her plan stream hears presence on the plan with Jamie and Kyle.
  - `a page for a stream that isn't open changes nothing`: `PUT` with an unknown client is 204, and Jamie's next event is the next change, not presence.
  - `a key can't say it's on a page`: `PUT` with an API key is refused.
- [ ] **Step 2: Write the failing web test** `where.test.ts`: `the list and the plan are pages with people on them` (`/list/kroger` is `"list"`, `/recipes` is null). `the stream is wanted in the app and the cook view, not on sign-in or a shared recipe` (`["__root__", "/_app", "/_app/"]` true; `["__root__", "/_focus", …]` true; `["__root__", "/login"]` false; `["__root__", "/r/$token"]` false).
- [ ] **Step 3: Run them** and check they fail.
- [ ] **Step 4: Implement** the bus's `movePage`, the route, `where.ts`, and the move of `LiveUpdates`. Regenerate the API (Global Constraints). Add the test to `package.json`.
- [ ] **Step 5: Run the tests** and check they pass, then the whole events test file, `pnpm --filter @merran/web test` and both typechecks.
- [ ] **Step 6: Check in a browser** (Review Focus 4). Move between Today, the list, the plan, a recipe and its cook view, and back: one `/api/events` request stays open the whole time (none closed, none new), and each move onto or off the list or the plan sends one `PUT /api/events/page`. In a second tab, change the list: the first tab's list updates while it's open, and so does its Today after going there. Stop the dev API's stream by switching the tab offline and back (devtools): the stream connects again with the page open, and catches up.
- [ ] **Step 7: Commit:** "Keep the live stream open across pages, saying the page open as it changes".

### Task 11: A recipe write announces only what it changes

Decision 12: in this slice.

**Files:**
- Modify: `apps/server/src/http/middleware/live.ts`, `apps/server/src/http/routes/events/events.test.ts`

What each write under `/api/recipes` announces, in place of the one rule giving all four:

| Paths under `/api/recipes` | Announces | Why |
|---|---|---|
| `/{recipe}/stand-ins`, `/import/links/check` | Nothing | Nothing's saved |
| `/{recipe}` (an edit, or to Recently deleted), `/{recipe}/photo`, `/{recipe}/photo/make`, `/{recipe}/swap`, `/{recipe}/needs`, `/{recipe}/versions/{id}/restore`, `/{recipe}/made`, `/bulk`, `/deleted` and below | `recipes`, `plan`, `list`, `pantry` | What the plan, the list and the pantry show of a recipe (its name, photo, servings, lines and what's left out), Made it cooking a meal, and Recently deleted taking meals off the plan |
| `/{recipe}/nutrition` | `recipes`, `plan` | The plan's nutrition totals |
| The rest: a new recipe (`/`), `/import` and below, `/{recipe}/rating`, `diets`, `pairings`, `share`, `cook-notes`, `duplicates`, `tidy`, `/tags` and below, and the `/nutrition`, `/photos` and `/tidy` runs | `recipes` | Only recipes, Review and tags show them |

- [ ] **Step 1: Check the table against the code.** For each route in the last row, read its service: if it writes plan entries, list items or pantry items, or changes what the plan, the list or the pantry show of a recipe, it goes up to the second row. Say in the commit message which moved, if any.
- [ ] **Step 2: Write the failing test** in `events.test.ts`: `say what a recipe write changes: a rating only recipes, finding links nothing, Made it the plan too`. Jamie listens. Kyle rates a recipe: Jamie's next event is `recipes`, then Kyle `POST`s `/api/recipes/import/links/check` and changes the list: the next event is `list` (finding links said nothing). Kyle marks the recipe made: `recipes`, `plan`, `list`, `pantry`, in that order.
- [ ] **Step 3: Run it** and check it fails.
- [ ] **Step 4: Implement** the rules in `CHANGES`, most specific first, each with a comment saying why, before the household rules.
- [ ] **Step 5: Run the events tests** and check they pass.
- [ ] **Step 6: Commit:** "Announce only the areas a recipe write changes".

### Task 12: Docs, and the whole check

**Files:**
- Modify: `docs/performance.md`:
  - "What slice 8 built" after slice 7's: what each task did, the measurements before and after (from Task 2's build log and the table above), the decisions as decided, and what was decided while building.
  - Slice 8's row: built, with the date; the opening paragraph's list of slices.
  - Under "The web app", each finding it fixes marked "Fixed in slice 8": `@merran/shared`'s chunk, the small chunks, the font, pages waiting in a chain, Today's whole collections, onboarding's refetches, nothing showing while a page loads, and the rest of the refetch storms (announcing fewer areas, and the stream across pages).
  - Decisions 11 to 14 marked decided, with the date and what was chosen.
- Modify: `docs/features.md`: "Today: the next meal…" (one summary, loaded with the page), "Made for phone, tablet and desktop" (a lighter first load in fewer files, pages loaded with their data, a bar while one loads), and "Live events stream" (stays open across pages; `PUT /api/events/page`).
- Modify: the site's `apps/docs/src/content/docs/docs/api/live-events.md` (the stream stays open; the page open is told with `PUT /api/events/page`), and `api/index.md`'s onboarding sentence (reading it remembers the household's progress; `recordProgress` isn't needed).

- [ ] **Step 1: Write them,** by hand. Never run Prettier on `docs/`.
- [ ] **Step 2: Run the whole check:** `pnpm format:check`, `pnpm typecheck`, `pnpm --filter @merran/server test` (SQLite), `pnpm --filter @merran/shared test`, `pnpm --filter @merran/web test`, `check:locales` and `build` (the budget passes), `pnpm --filter @merran/extension build` and `build:firefox`, and `pnpm docs:build` (its links check). Postgres runs in CI.
- [ ] **Step 3: Commit:** "Say what slice 8 built".
