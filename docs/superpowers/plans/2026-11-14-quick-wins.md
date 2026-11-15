# Speed: Quick Wins (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slice 1 of the speed plan: the cheap fixes felt on every page. Compressed responses, lighter first loads, searches that don't flash, fewer refetches and polls, no jobs that do nothing, and the missing indexes.

**Architecture:** Server: Hono's `compress()` for the API, built files served precompressed and before sign-in, a light route for site suggestions, nutrition and photo jobs queued only when they can run, and indexes declared on the entities with one migration per database. Web: heavy modules behind dynamic imports, `keepPreviousData` on searches, live changes gathered before refetching, query freshness that trusts a working live stream, and polls narrowed to what they wait for.

**Tech Stack:** Hono 4.13 (`hono/compress`), `@hono/node-server` 2.1 (`serveStatic`'s `precompressed`), MikroORM 7.2 (index `where` for partial indexes), Vite, React 19 (`React.lazy`), TanStack Query 5.107 (function `staleTime` and `refetchOnWindowFocus`), vitest (server), node:test (web).

**Spec:** [docs/performance.md](../../performance.md), slice 1 in "The plan", with the findings it points to ("The web app", "The database", "Discover and the shelf", "The job runner" item 7, "Work still inside a request").

**Where:** branch `perf/quick-wins`, in the worktree `.claude/worktrees/quick-wins`, branched from `docs/performance-plan` (PR #94), so the plan doc is here. Merge main in once #94 lands.

## Global Constraints

- Every rule in `AGENTS.md`: readable, expanded code; comments in plain English that say why; words people read in `apps/web/src/locales/en.json`; routes mirror the API (`GET /api/sites/suggestions` is `apps/server/src/http/routes/sites/suggestions/get.ts`, registered by that folder's `index.ts`); files in folders.
- No new dependencies. Compression uses `node:zlib` and `hono/compress`.
- Prettier from the root only (`pnpm format`), never on `docs/`.
- After API changes: `pnpm --filter @merran/server openapi`, then the two `api` scripts in PowerShell: `$env:pnpm_config_cache_dir = "D:\Development\Mise\.local\pnpm-cache"; pnpm --filter @merran/web api; pnpm --filter @merran/extension api`. Both `schema.d.ts` files must match.
- Migrations: `pnpm --filter @merran/server db:test-postgres` (Docker), then `pnpm --filter @merran/server db:migration speed_indexes`. If Docker won't start, generate the Postgres one offline: MikroORM from `@mikro-orm/postgresql` with `connect: false`, a dummy `clientUrl`, the entities, `extensions: [Migrator]` and `orm.ts`'s migrations options, then `orm.migrator.create(undefined, false, false, "speed_indexes")`. Read both files: no `__temp_alter` (a table rebuild), only `create index` and `drop index`.
- Focused server tests: `pnpm --filter @merran/server exec vitest run --project sqlite <path>` (`test -- <pattern>` runs everything).
- Web unit tests are node:test files listed in `apps/web/package.json`'s `test` script. Add each new one there. They import relative files with the `.ts` extension, and never `@/` paths.
- Numbers, fixed here: gather a person's changes for **1,000 ms** and Merran's (`by: null`) for **5,000 ms**. A live stream counts as working when a message came in the last **60,000 ms** (the server pings every 25 s). While it works, queries it covers stay fresh for **5 minutes** (otherwise 30 s) and don't refetch on focus. Precompress built files of **1,024 bytes** or more ending in `.js`, `.css`, `.html`, `.svg`, `.json`, `.webmanifest`, `.txt` or `.map`, to `.br` (quality 11) and `.gz` (level 9). Sites poll while `reading`, or while posts are `waiting` and `readAt` is under **3 minutes** old.

## Review Focus

1. **Streams stay streams.** The live stream (`/api/events`) and the assistant's chat reply (`text/event-stream`) must arrive as they're written, never buffered by compression. `compress()` skips `text/event-stream` and `no-transform`; Task 1's test pins the live stream's.
2. **A browser that doesn't take Brotli** (`Accept-Encoding: gzip`) gets `.gz`, and one that sends none gets the plain file with no `Content-Encoding`. Owned by Task 1.
3. **A phone waking with a dead stream.** An EventSource can look open after sleep while nothing arrives. Freshness must depend on recent messages, not `readyState`, so the focus refetch comes back. Owned by Task 5 (`liveConnected` after 61 s of silence is false).
4. **Settings that change while a job waits.** Checking before queueing must not remove the job's own check: a key removed after queueing still ends the job quietly. Task 7 keeps both checks.
5. **A server with years of data.** The migration only adds and drops indexes; it must never rebuild a table (rebuilds cascade-delete children on SQLite). Task 8 checks the generated SQL.

---

### Task 1: Compress the API, and serve built files before sign-in

**Files:**
- Modify: `apps/server/src/http/web-app.ts`, `apps/server/src/app.ts`
- Test: `apps/server/src/http/web-app.test.ts`, `apps/server/src/http/routes/events/events.test.ts`

**Interfaces:**
- Produces: `serveWebFiles(app: Router, dir: string): void` (files, precompressed, before sign-in) and `serveWebApp(app: Router, dir: string, logger: Logger, publicUrl: string | null): void` (now only `/share` and the page fallback). `serveWebFiles` does nothing when `dir/index.html` is missing.

- [ ] **Step 1: Write the failing tests** in `web-app.test.ts`. The test's `createApp` calls `serveWebFiles(app, webDir)` before `serveWebApp(...)`. Write `assets/app-1a2b.js.br` and `.gz` next to the asset (any bytes, e.g. `"br!"` and `"gz!"`).
  - `serves the Brotli copy to browsers that take it`: `Accept-Encoding: br, gzip` gives `content-encoding: br`, body `"br!"`, `vary` containing `Accept-Encoding`, and `cache-control` containing `immutable`.
  - `serves the gzip copy to browsers that only take gzip`: `content-encoding: gzip`, body `"gz!"`.
  - `serves the file as it is without Accept-Encoding`: no `content-encoding`, body `"console.log('hi')"`.
  - `serves files without asking who's signed in`: `createApp` gets an extra middleware after `serveWebFiles` that throws. `/assets/app-1a2b.js` is still 200.
  - `compresses API answers`: a route `app.get("/api/big", (c) => c.json({ text: "a".repeat(5000) }))` behind `app.use(compress())`. With `Accept-Encoding: gzip` it gives `content-encoding: gzip`.
- [ ] **Step 2: Write the failing test** in `events.test.ts`: `the live stream isn't compressed`. Open `/api/events` with `Accept-Encoding: gzip` and check there's no `content-encoding` header.
- [ ] **Step 3: Run them** and check they fail: `pnpm --filter @merran/server exec vitest run --project sqlite src/http/web-app.test.ts src/http/routes/events/events.test.ts`.
- [ ] **Step 4: Implement.** Split `serveWebApp`: its first `app.use("*")` (files and the assets' cache header) becomes `serveWebFiles`, with `serveStatic({ root: dir, precompressed: true })`. In `createApp`, call `app.use(compress())` straight after `requestId()`, and `serveWebFiles` after `secureHeaders()`, before `entityManager` and `authenticateRequests` (built files need neither). Call `serveWebApp` where it is now. Leave the `if (deps.config.webDir)` guard around both.
- [ ] **Step 5: Run the tests** and check they pass. Then run the whole web-app and events files.
- [ ] **Step 6: Commit:** "Compress answers, and serve the web app's files before sign-in".

### Task 2: Precompress the web app when it's built

**Files:**
- Create: `apps/web/build/precompress.ts`, `apps/web/build/precompress.test.ts`
- Modify: `apps/web/vite.config.ts`, `apps/web/package.json` (test list), `apps/web/tsconfig.node.json` if it doesn't cover `build/`

**Interfaces:**
- Produces: `precompress(dir: string): Promise<number>`, which writes `.br` and `.gz` next to each matching file under `dir`, recursively, and returns how many files it compressed. `precompressPlugin(): Plugin`, a Vite plugin whose `closeBundle` runs `precompress` on the build's `outDir` (only for `vite build`: `apply: "build"`).

- [ ] **Step 1: Write the failing test** `precompress.test.ts` (node:test). In a temp dir: `assets/app.js` (2,000 bytes), `small.js` (100 bytes), `photo.png` (2,000 bytes), `index.html` (2,000 bytes).
  - `compresses big text files both ways`: returns 2. `assets/app.js.br`, `assets/app.js.gz`, `index.html.br` and `index.html.gz` exist, and `zlib.brotliDecompressSync` / `gunzipSync` of them gives the originals back.
  - `leaves small files and images alone`: no `small.js.br`, no `photo.png.gz`.
  - `doesn't compress what it wrote`: run it twice; the second run returns 2, and there's no `app.js.br.br`.
- [ ] **Step 2: Run it** and check it fails: `node --test apps/web/build/precompress.test.ts`.
- [ ] **Step 3: Implement** with `node:fs/promises` (`readdir` with `recursive: true`) and `node:zlib`'s promisified `brotliCompress` (`BROTLI_PARAM_QUALITY: 11`, `BROTLI_PARAM_SIZE_HINT`: the file's size) and `gzip` (`level: 9`). Use the extensions and threshold in Global Constraints. Skip anything already ending in `.br` or `.gz`. Add `precompressPlugin()` after `tailwindcss()` in `vite.config.ts`.
- [ ] **Step 4: Run the test** and check it passes. Then run `pnpm --filter @merran/web build` and check `apps/web/dist/assets/` has `.br` and `.gz` next to the `.js` and `.css` files.
- [ ] **Step 5: Commit:** "Precompress the web app's files when it's built".

### Task 3: Load the assistant, the tour, markdown and the sign-in client only when needed

**Files:**
- Create: `apps/web/src/features/auth/return-to.ts`, `apps/web/src/features/onboarding/tour-driver.ts`, `apps/web/src/features/server/update-notes.tsx`
- Modify: `apps/web/src/features/auth/client.ts`, `apps/web/src/routes/verify.tsx`, `apps/web/src/routes/login.tsx`, `apps/web/src/features/assistant/assistant-panel.tsx`, `apps/web/src/features/onboarding/tour-context.tsx`, `apps/web/src/features/server/updates.tsx`, and whatever imported the moved parts

**Interfaces:**
- Produces: `safeReturnTo(target: string | undefined): string` in `features/auth/return-to.ts`, moved as it is. `client.ts` no longer exports it. `tour-driver.ts` holds the `driver.js` imports and its CSS (`driver.js/dist/driver.css`, `./tours.css`) and exports what `tour-context.tsx` needs, loaded with `import("./tour-driver")`.

- [ ] **Step 1: Take a baseline.** Run `pnpm --filter @merran/web build` and note the entry chunk's name and size (the `index-*.js` that `dist/index.html` loads) and the signed-in shell's chunk. `grep -l` both for `driver.js`, `react-markdown`, `createAuthClient` and `DefaultChatTransport`, and note which contain them.
- [ ] **Step 2: Move `safeReturnTo`** to `return-to.ts`, and import it from there in `verify.tsx`, `login.tsx` and anywhere else. The routes' `validateSearch` and `beforeLoad` stay in the main chunk, so the sign-in client must not be imported for them.
- [ ] **Step 3: Load `ChatView` lazily.** `const ChatView = React.lazy(() => import("./chat-view").then((module) => ({ default: module.ChatView })))`, rendered inside `<React.Suspense>` with the same skeleton `SavedChat` shows while loading.
- [ ] **Step 4: Load driver.js when a tour starts.** `start` still decides synchronously whether a tour can start (its steps, its checks) and returns that boolean. Then it loads `tour-driver.ts` and builds the tour. If the path or the person changed meanwhile (the existing `interrupted` ref), it doesn't start.
- [ ] **Step 5: Move the release notes** (the part of `updates.tsx` that renders `<Markdown>`) into `update-notes.tsx`, imported only by the This server page's card, so the sidebar's Update badge no longer brings `react-markdown`.
- [ ] **Step 6: Verify.** `pnpm --filter @merran/web typecheck` and `build`. Then grep as in Step 1: the entry chunk and the shell's chunk contain none of the four. Note the new sizes for the PR. In the dev server (as the test admin in "The Johnsons"), open the assistant and send a message, start the page tour from Help, and open Settings → This server with an update showing (or check that the card renders).
- [ ] **Step 7: Commit:** "Load the assistant, the tour, release notes and the sign-in client when they're needed".

### Task 4: Keep the last results on screen while a search loads

**Files:**
- Modify: `apps/web/src/features/recipes/queries.ts` (`recipesQuery`), `apps/web/src/features/recipes/recipe-picker.tsx`, `apps/web/src/features/recipes/goes-with.tsx`, `apps/web/src/routes/_app/recipes/index.tsx`

- [ ] **Step 1: Implement.** `placeholderData: keepPreviousData` on the three queries. Skeletons show only while there's nothing yet (`isPending`, as now). While old results stand in (`isPlaceholderData`), dim the grid or list (`opacity-60 transition-opacity`) and set `aria-busy`.
- [ ] **Step 2: Verify** in the dev server: type in the library's search, change a filter, and search in the plan's Add a meal picker and a recipe's Goes with picker. The old results stay, dimmed, until the new ones replace them, with no skeleton flash. `pnpm --filter @merran/web typecheck`.
- [ ] **Step 3: Commit:** "Keep the last results on screen while a search loads".

### Task 5: Gather live changes, and trust a working live stream

**Files:**
- Create: `apps/web/src/features/live/state.ts`, `apps/web/src/features/live/state.test.ts`, `apps/web/src/features/live/gather.ts`, `apps/web/src/features/live/gather.test.ts`
- Modify: `apps/web/src/features/live/live-updates.tsx`, `apps/web/src/lib/query-client.ts`, `apps/web/package.json` (test list)

**Interfaces:**
- Produces, in `state.ts` (no React):
  - `LIVE_REFRESH: Record<string, QueryKey[]>`, moved from `REFRESH` in `live-updates.tsx`, unchanged.
  - `heardFromLive(now?: number): void`, `lostLive(): void`, `liveConnected(now?: number): boolean` (a message in the last 60,000 ms).
  - `coveredByLive(queryKey: QueryKey): boolean`: some `LIVE_REFRESH` key is a prefix of it.
  - `freshFor(queryKey: QueryKey, now?: number): number`: 300,000 when covered and connected, else 30,000.
  - `refetchOnFocus(queryKey: QueryKey, now?: number): boolean`: false when covered and connected.
- Produces, in `gather.ts`: `gatherChanges(refresh: (keys: QueryKey[]) => void, timers?: { set: typeof setTimeout; clear: typeof clearTimeout }): { add(area: string, byMerran: boolean): void; stop(): void }`.

- [ ] **Step 1: Write the failing tests** (node:test, with `mock.timers` for time):
  - `state.test.ts`: `a plan query is covered, a settings one isn't` (`["plan", "week", "2026-11-16"]` true, `["settings", "server"]` false). `a stream that's quiet for a minute isn't trusted` (`heardFromLive(0)`, then `liveConnected(59_999)` true and `liveConnected(60_001)` false). `covered queries stay fresh for five minutes while it's working` (`freshFor(["list"], now)` is 300,000 right after `heardFromLive(now)`, and 30,000 after `lostLive()`). `settings queries stay at thirty seconds` either way. `covered queries skip the focus refetch only while it's working`.
  - `gather.test.ts`: `a person's changes are gathered for a second` (two `add("plan", false)` 300 ms apart give one `refresh` at 1,000 ms, with `["plan"]` once). `Merran's changes wait five seconds` (`add("recipes", true)` gives nothing at 4,999 ms and one refresh at 5,000). `a person's change brings Merran's forward` (`add("recipes", true)` at 0, `add("list", false)` at 2,000, one refresh at 3,000 with both areas' keys). `an area changed twice is refreshed once` (`add("list", false)` twice gives one refresh in which each of `LIVE_REFRESH.list`'s keys appears once). `stop() cancels what's waiting`.
- [ ] **Step 2: Run them** and check they fail: `node --test apps/web/src/features/live/state.test.ts apps/web/src/features/live/gather.test.ts`.
- [ ] **Step 3: Implement** `state.ts` and `gather.ts`. In `live-updates.tsx`, every message (`ready`, each area, `presence`, `ping`) calls `heardFromLive()`. Areas go through `gatherChanges`, `byMerran` being `JSON.parse(message.data).by === null`. The catch-up after a gap and the cleanup call `stop()` first, and the cleanup and a closed connection call `lostLive()`. In `query-client.ts`: `staleTime: (query) => freshFor(query.queryKey)` and `refetchOnWindowFocus: (query) => refetchOnFocus(query.queryKey)`. Queries that set their own `staleTime` keep it.
- [ ] **Step 4: Run the tests** and check they pass. `pnpm --filter @merran/web test` and `typecheck`.
- [ ] **Step 5: Verify** in the dev server with two tabs: a change in one shows in the other about a second later. Switching tabs back doesn't refetch the plan (Network panel), and does after the server's been stopped for over a minute.
- [ ] **Step 6: Commit:** "Gather live changes before refetching, and don't refetch on focus while the live stream works".

### Task 6: Poll less on Find, and say videos can be imported

**Files:**
- Create: `apps/server/src/http/routes/sites/suggestions/get.ts`, `apps/server/src/http/routes/sites/suggestions/index.ts`, `apps/web/src/features/find/opening.ts`, `apps/web/src/features/find/opening.test.ts`
- Modify: `apps/server/src/services/recipes/discover/sites/sites.ts`, `apps/server/src/http/routes/sites/index.ts` (register `suggestions` before `[site]`), `apps/server/src/http/routes/sites/sites.test.ts`, `apps/server/src/http/routes/recipes/import/post.ts`, `apps/server/src/http/routes/recipes/import/links/check/post.ts`, `apps/web/src/features/find/queries.ts`, `apps/web/src/features/find/sites-spotlight.tsx`, `apps/web/src/routes/_app/recipes/find/$collection.tsx`, `apps/web/package.json` (test list), the OpenAPI file and both `schema.d.ts`

**Interfaces:**
- Produces: `GET /api/sites/suggestions`, operationId `listSiteSuggestions`, `openToKeys("recipes", "read")` like `GET /api/sites`, answering `{ following: number, suggestions: { name, url, description }[] }`, with the suggestion schema `GET /api/sites` already uses. Service: `siteSuggestions(em: EntityManager, language: string): Promise<{ following: number; suggestions: SiteSuggestion[] }>`, sharing the suggestions code with `listSites`.
- Produces, web: `stillOpening(site: Pick<FollowedSite, "reading" | "waiting" | "readAt">, now?: number): boolean`, `siteSuggestionsQuery` (key `["recipes", "sites", "suggestions"]`), and `discoveryQuery(id: string)` (key `["recipes", "discover", id]`, `GET /api/discover/{discoveryId}`, polling every 2,000 ms while its `status` is `searching`).

- [ ] **Step 1: Write the failing server test** in `sites.test.ts`: `suggestions say how many sites are followed, without reading them`. A household following nothing gets `following: 0` and the language's suggestions. After following one suggestion, `following: 1`, and that suggestion is gone from the list.
- [ ] **Step 2: Write the failing web test** `opening.test.ts`: `a site read for the first time is still opening` (`reading: true`). `posts waiting just after a read are still opening` (`waiting: 2`, `readAt` 60 s ago). `posts still waiting long after a read aren't` (`waiting: 2`, `readAt` 4 minutes ago: false, so a refused post stops the polling). `nothing waiting isn't`.
- [ ] **Step 3: Run both** and check they fail.
- [ ] **Step 4: Implement the route and service.** Then fix the two descriptions. `POST /recipes/import` drops "Video links can't be imported yet." and says a TikTok, YouTube, Instagram or Facebook link is imported from its video. The check route says a batch leaves videos out, to import one at a time. Regenerate the OpenAPI file and both `schema.d.ts`.
- [ ] **Step 5: Implement the web side.** `SitesStart` uses `siteSuggestionsQuery` (shown when `following === 0` and there are suggestions). `sitesQuery` polls every 5,000 ms only while some site is `stillOpening`. `collectionQuery` loses its `refetchInterval`. The collection page follows `discoveryQuery(found.id)` while `found.status === "searching"` and shows its result in `<Search>`. When that's no longer `searching`, it invalidates `collectionQuery(id)` once.
- [ ] **Step 6: Run the tests** and check they pass: the sites test file, `pnpm --filter @merran/web test` and `typecheck`, and `pnpm --filter @merran/server test -- routes` for the route layout test.
- [ ] **Step 7: Verify** in the dev server: the Recipes page asks `/api/sites/suggestions`, not `/api/sites`. On a collection, Find more polls `/api/discover/…` until it's done, then the collection refreshes once.
- [ ] **Step 8: Commit:** "Poll only what Find is waiting for, and a light check for followed sites".

### Task 7: Queue nutrition and photo jobs only when they can run

**Files:**
- Modify: `apps/server/src/services/nutrition/runs.ts` (`nutritionAfterSave`), `apps/server/src/services/recipes/photos/runs.ts` (`photoAfterCreate`), `apps/server/src/services/recipes/recipes.ts` (`createRecipe`, `updateRecipe`), and their callers without `deps`: `saveSwap` (`services/recipes/swaps.ts`), `undoShoppingSwap` (`services/list/substitutions/substitutions.ts`), `applySections` (`services/proposals/proposals.ts`), and the routes that call those
- Test: `apps/server/src/http/routes/recipes/nutrition/nutrition.test.ts`, `apps/server/src/http/routes/recipes/import/ai-import.test.ts`

**Interfaces:**
- Produces: `export type AfterSaveDeps = Pick<AppDeps, "settings" | "fetcher" | "ai" | "media" | "files">` in `recipes.ts`. `createRecipe` and `updateRecipe` options gain `deps: AfterSaveDeps`. `nutritionAfterSave(deps, em, options)` and `photoAfterCreate(deps, em, options)` take it first.

- [ ] **Step 1: Write the failing tests.**
  - `nutrition.test.ts`, a new `describe("on a server that can't work it out")` with its own `createTestApp()` (no AI key, no USDA key): `saving a recipe queues no nutrition job`. After `POST /api/recipes` with servings and ingredients, `em.count(Job, { kind: "recipes.nutrition" })` is 0.
  - `ai-import.test.ts`: `a text import queues no photo job when photos aren't set up`. After importing from text, `em.count(Job, { kind: "recipes.photos" })` is 0.
- [ ] **Step 2: Run them** and check they fail (each finds 1).
- [ ] **Step 3: Implement.** `nutritionAfterSave` returns without queueing when `nutritionAbilities` finds no USDA key and no AI. `photoAfterCreate` returns when `PHOTOS.auto` is off or `aiPhotosFor` isn't `ok`. The jobs keep their own checks, for settings changed while they wait. Thread `deps` through the callers.
- [ ] **Step 4: Run the tests** and check they pass, then the recipes, nutrition, photos, import, swaps, substitutions, proposals and assistant test folders.
- [ ] **Step 5: Commit:** "Queue nutrition and photos after a save only when they can be made".

### Task 8: Add the missing indexes

**Files:**
- Modify: every entity in `apps/server/src/database/entities/` with a `manyToOne` that has no index on Postgres (44 at the time of writing; list them with the script in Step 1), `jobs.ts`, `recipes.ts`, `site_recipes.ts`
- Create: the two migrations (`migrations/sqlite/` and `migrations/postgres/`, named `speed_indexes`), with their snapshots
- Test: `apps/server/src/database/migrations.test.ts`

- [ ] **Step 1: Write the failing test** in `migrations.test.ts`: `every foreign key has an index on Postgres`. Read `migrations/postgres/.snapshot.json`. For each table's `foreignKeys`, some index in its `indexes` must start with the same columns, in order. List the ones that don't in the failure message.
- [ ] **Step 2: Run it** and check it fails, listing the 44.
- [ ] **Step 3: Declare the indexes.**
  - `.index()` on each foreign key the test lists. SQLite has an index of that name for each already, so its migration shouldn't touch them.
  - `jobs`: drop `.index()` from `status`. Add `indexes: [{ properties: ["status", "runAt", "createdAt"] }, { properties: ["forHousehold", "kind", "status"] }]`.
  - `recipes`: drop `.index()` from `deletedAt`. Add `{ properties: ["deletedAt"], where: { deletedAt: { $ne: null } } }` and `{ properties: ["household", "createdAt"], where: { deletedAt: null } }`.
  - `site_recipes`: add `{ properties: ["classic", "openedAt"] }`.
  - Not here: `purchases(household_id, bought_on)` waits for slice 7, which makes usual buys read a window. A unique `chat_messages(chat_id, position)` is left out: `chat_id`'s index already finds a chat's messages, and a unique index would refuse to migrate a server where two sends once raced. Say both in performance.md (Task 9).
- [ ] **Step 4: Generate the migrations** (Global Constraints). Read both files. They should only have `create index` and `drop index`, with no `__temp_alter`. The partial indexes should have their `where` on both databases.
- [ ] **Step 5: Run the tests** and check they pass: `migrations.test.ts` on SQLite. Then `pnpm --filter @merran/server test:all` if Docker runs; otherwise CI covers Postgres. Check the snapshot doesn't change on a fresh migrate.
- [ ] **Step 6: Commit:** "Index every foreign key on Postgres, and the runner's and library's lookups".

### Task 9: Docs, and the whole check

**Files:**
- Modify: `docs/performance.md`, `docs/features.md`

- [ ] **Step 1: performance.md.** Mark slice 1 built (date) in the plan's table and the intro. In Findings, mark what it fixed. Record the decisions: the gather windows and the 5-minute freshness, `chat_messages` left out and `purchases` moved to slice 7 (both with their reasons), and the bundle sizes before and after from Task 3.
- [ ] **Step 2: features.md.** On "Fast search, filters and sorting, even in big libraries", add that results stay on screen while a new search loads.
- [ ] **Step 3: The whole check:** `pnpm typecheck`, `pnpm format:check`, `pnpm --filter @merran/server test`, `pnpm --filter @merran/web test`, `pnpm --filter @merran/shared test`, `pnpm --filter @merran/web build`, and `pnpm --filter @merran/extension build`.
- [ ] **Step 4: Commit:** "Note slice 1 as built".
- [ ] **Step 5: Open the pull request** `perf: quick wins: compression, lighter first loads, fewer refetches and polls, indexes`, based on `docs/performance-plan` until #94 merges. Its body lists the bundle sizes before and after.
