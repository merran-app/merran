# Speed, search and background work

Audited November 10, 2026. Nothing here is built yet: this is what's slow or feels slow, what still runs inside a request that should be a job, what search and Discover need, and which indexes are missing, split into slices to plan in detail and build one at a time. The order, the job lanes, imports and the Imports page were decided the same day ([Decisions](#decisions)); how search matches was left to a revamp of its own.

## Goal

- **Nothing slow waits on a request.** Anything that can take more than a few seconds (fetching pages, AI, video, image work, reading a big file) runs as a job, and people can leave the page and come back to it.
- **Background work leaves a record,** like Mealie's reports: every import says what came in and what didn't, and stays there to look at once it's finished.
- **Search and Discover show what they've found as they find it,** and there's always a way to see more.
- **The database has indexes for the queries Merran actually runs,** and nothing gets slower with a household's history unless it has to.
- **The app opens fast on a phone,** over home Wi-Fi or a tunnel.

## What's already right

So none of it is done again:

- The job runner (`apps/server/src/services/jobs/`) survives restarts, retries with backoff, limits each kind and shares out fairly between households. Imports of several links, starter collections, Discover, Merran and app imports, library runs, cook-note edits, and nutrition and photos after saving are all jobs already.
- Library search runs on the server, 48 recipes a page with **Show more**, debounced and kept in the address, with tags fetched in one query (no query per recipe).
- Routes are split into their own chunks (`autoCodeSplitting`), hashed assets are cached for a year, and photos are WebP in two sizes with lazy loading on cards.
- On SQLite, every foreign key has an index (MikroORM adds one for each `manyToOne`). Postgres is another story; see [The database](#the-database).
- Token and hash lookups (share links, calendar subscriptions, sessions, OAuth tokens, rate limits) are all unique indexes, and price history, store products and placements are covered by their unique keys.

## Findings

### Work still inside a request

| Where | What it does | Can take | Should be | Size |
|---|---|---|---|---|
| Import from a link (`POST /recipes/import`, `services/recipes/import/import-link.ts`), and the same import from the extension (`import/page`), the share sheet (`services/share/share.ts`) and an assistant's import proposal | Fetches the page (60 s through FlareSolverr), reads it with AI when there's no recipe data, downloads up to 5 photos and resizes them | 1–3 s usually, 10–30 s with AI, over 2 minutes at worst | A one-link import job. The request waits a few seconds and hands over if it isn't done | M |
| Video links (`isVideoLink` → `video/import.ts`) | yt-dlp, ffmpeg, transcription of up to 30 minutes, vision AI. Waits first in an in-memory queue of 2 downloads for the whole server (`video/tools.ts`), lost on a restart | Often minutes: past Cloudflare's 100 s limit, so tunnelled servers time out | Always a job. The most important one here | in the above |
| Checking an uploaded Mealie or Paprika file (`households/current/import/files`, `services/recipes/import/apps/files.ts`) | Parses every recipe; Paprika files are unzipped with `gunzipSync`, embedded photos included | Seconds to a minute, and it blocks every other request and job meanwhile | Checked in a job ("Checking the file…"), unzipped without blocking | M |
| Reading a receipt (`services/pantry/receipts/receipts.ts`) | Rotates and tiles the photos with sharp, then one vision AI call | 10–60 s | Saved as "reading"; a job fills it in and says when it's ready to review | M |
| **Work out nutrition**, **Make a photo**, **Check prices now** | USDA searches one after another (about 40 calls for a 20-ingredient recipe nobody's matched before); image generation; up to 50 Kroger searches and an AI pick | Up to minutes | The nutrition, photo and price jobs that exist, run for one recipe or now | S each |
| **Empty** Recently deleted (`services/recipes/deleted.ts`) | Removes each recipe's files, one network call each on S3 | Long on S3 | The purge job | S |
| Photos of site recipes (`sites/recipes/[recipe]/photo`, `shelf.ts`) | Fetched and resized the first time someone looks | 24 fetches from other sites when a collection opens | Fetched when the site is read | S |
| Import from text or photos (`import-with-ai.ts`) | One AI call | 5–40 s | Stays in the request, with a time limit | S |

Fine in the request: the assistant's streamed replies, a tidy-up suggestion, swaps, stand-ins, voice, sending to Kroger, and the household export (it streams). Kroger's basket review (5–60 s on a long list) is interactive, so it stays for now.

Across all of it, **AI calls have no time limit** (`useAi` in `services/ai/run.ts` passes no abort signal), and jobs don't pass their stop signal to the fetcher or the AI, so **Stop** only takes effect between items, and a provider that hangs keeps its slot until Merran restarts.

### The job runner

1. **One full kind holds up the rest.** Each check takes the 50 oldest due jobs of any kind (`runner.ts`), then skips kinds already at their limit. A 100-link import queues up to 100 nutrition and 100 photo jobs, limited to a few at a time, which fill those 50 places, so other kinds and other households wait while slots are free. Fix: leave kinds at their limit out of the query.
2. **Four slots for everything,** with no priority and no setting. Invitation and password reset emails wait behind long AI runs, and the planned webhook deliveries (four at a time, in the webhooks plan) could take every slot. Fix: a lane for quick jobs (emails, webhook deliveries) apart from long ones (imports, library runs, Discover), and a setting for the long lane (decided; see [decision 4](#decisions)).
3. **Limits are for the whole server, and a whole import is one job.** [platform.md](platform.md#jobs) promises "three pages or one video at a time per household", but two big imports from one household block every household's link imports for as long as they take. Fix: limits per household as well as per kind.
4. **No time limits, and Stop isn't passed on** (above).
5. **Nothing says when a job moves.** The runner sends no events, so the web app runs about eight polling loops on six different APIs: a link import every second, the Recipes banner every 2 s, a household import every second, tidy-up every 2 s, nutrition and photo runs every 3 s, Discover every 2 s, sites every 5 s, and the server's jobs every 2 or 30 s. Link, app and household imports never announce a change, so other tabs and phones don't refresh. Fix: a household `job` event on the live stream when a job starts, moves on and finishes, and one way for the web app to follow any job.
6. **A household can't see its own jobs.** Only the server admin's Jobs card lists them (the 100 newest), and it has labels for 8 of the 18 kinds.
7. **Jobs that do nothing.** Every save queues a nutrition job and a photo job even when the household has no USDA key, no AI and no photos; each then just ends (`services/nutrition/runs.ts`, `services/recipes/photos/runs.ts`), and its row stays for 30 days. Fix: check before queueing.
8. **A link import forgets what it did when Merran restarts.** It starts again from its payload and ignores its saved result (`import-links.ts`), so links it already imported are reported as already in the library.
9. **One retry schedule for every kind.** The webhooks plan needs its own, so this lands with or before it.
10. **The docs don't match.** [stack.md](stack.md#a-job-runner-of-our-own-instead-of-hand-rolled-schedules) says jobs are claimed with `SKIP LOCKED` on Postgres; the runner uses a conditional update, which is right for one process. [platform.md](platform.md#jobs) lists a weekly classics check and prep reminders, which have no job yet.

### Following background work

- **Several links:** a job. The import's page polls every second, and Recipes shows a banner. You can leave and come back. But the list only shows imports still going (`activeLinkImports`); once one finishes it can only be reached by its address, its job is deleted after 30 days, and nothing says it's finished.
- **Mealie, Paprika and Merran files:** jobs, but the job is only remembered by the Settings card that started it (`app-import-card.tsx`, `import-card.tsx`). Leave Settings and the progress is gone, with no way back to it. The first 50 failures are kept, and only that card shows them.
- **One link, a video, text or photos:** the dialog waits for the request.
- **Mealie, for comparison** (from memory, not checked): every bulk import and migration leaves a report listing each item and whether it worked, kept until someone deletes it.

So what's missing is a household **Imports** page listing every import, how it went and what failed and why, with **Try again** for the failures, and a notice when an import finishes.

### Library search

- **It feels slow because it flashes.** Each new search swaps the grid for skeletons (there's no `placeholderData` on the library's query), though the query itself takes milliseconds. The plan's and pairings' recipe pickers do the same.
- **Matching is one phrase.** `%chicken soup%` against the name, the description and ingredient lines, so "chicken soup" doesn't find "Soup with chicken". Nothing is ranked (a name match doesn't beat an ingredient match), tags aren't searched by the text, and SQLite only ignores case for ASCII letters.
- **Every recipe change reloads every loaded page** of the library (below, under the web app).
- **The pickers stop at 50,** and their 36 px tiles download the 800×600 card photo.
- **Full-text search isn't worth it for speed yet.** The dev household has 57 recipes and 893 ingredient lines; even 30,000 lines is a scan of a few milliseconds. FTS5 and Postgres `tsvector` would only add word stems and ranking, with two implementations to keep. Matching each word separately, plus a simple ranking, gets most of the benefit.
- How search matches is left to its own revamp ([below](#later-the-search-revamp)); only the flashing (slice 1) and the pickers' limit (slice 6) are fixed here.

### Discover and the shelf

- **Discover shows nothing until it's all done.** One AI call with web search picks 10–12 links; the pages are opened four at a time, each four waiting for the slowest (up to 15 s); a second AI round runs if fewer than four opened; then the best 8 (two per site at most) are saved together at the end (`services/recipes/discover/discover.ts`). The web app polls all 12 recent searches every 2 s and shows skeletons until then. The first result arrives with the last, roughly 30 s to 2 minutes and more with a second round (estimated, not measured). It reports no progress and ignores **Stop**.
- **No Find more on Discover.** Only a collection's Find more tells the search what's already been shown, so the same search again can bring the same dishes.
- **Discover's photos are the sites' full-size images,** linked directly rather than resized like shelf photos.
- **The Sites tab** makes four queries per followed site (`listSites`), shows 24 of the 120 kept for each with no way to see more, and polls every 5 s while any site has posts waiting. A post refused with 403 or 429 stays waiting, so that polling can go on for hours (how often this happens is unsure). The Recipes page loads all of it, poll included, just to know whether any site is followed (`SitesStart`).
- **Followed sites' spotlight** takes the newest 24 and then drops the ones that don't suit the household, in the browser, so it can show very few, with no more to see.
- **Starter collections** load the whole shelf (up to about 1,400 recipes, ingredients included) on every request, check the household's tastes on each and run the rules in JavaScript; each shows 24, with no more. During Find more the page polls every 2 s, repeating all of that each time.
- **The shelf can't be searched** anywhere.

### The database

**Postgres has 38 foreign keys with no index.** MikroORM only indexes foreign keys by itself on SQLite; on Postgres, only the ones an entity marks `.index()` (the `householdRef()` and `recipeRef()` helpers and a few more). The ones that matter:

- `plan_entries.recipe_id` and `with_recipe_id`: every meal saved or cooked looks up when its recipes were last made (`remade()` in `services/plan/plan.ts`), and every recipe deleted for good cascades into the plan, so both scan years of plan entries.
- `recipe_pairings.paired_recipe_id`: cascades on delete.
- The rest (users, aisles, lists, secrets, jobs) only cost a scan when one of those is deleted.

Marking them `.index()` should leave the SQLite migration empty, since SQLite has indexes by the same names already (to check when it's generated).

**Indexes to add:**

| Table (columns) | For | Why |
|---|---|---|
| The Postgres foreign keys above | Cascades, `remade()` | Scans on every meal saved and every recipe deleted |
| `purchases(household_id, bought_on)` | Usual buys (`services/list/usual.ts`) | Only once that query reads a window rather than everything (below) |
| `jobs(status, run_at, created_at)` | The runner's check every 5 s | Today it's separate `status` and `run_at` indexes and a sort; this replaces the `status` one |
| `jobs(for_household_id, kind, status)` | "The latest run" (autoplan, link imports, nutrition runs) and a household's own jobs list | Small now; grows with slice 2 |
| `recipes(deleted_at) where deleted_at is not null`, in place of the plain one | Recently deleted and the purge | The plain index is almost all nulls, and with no planner statistics SQLite may pick it for `deleted_at is null` over the household's index. Both databases have partial indexes; whether MikroORM 7 declares one without SQL per database is unsure |
| `recipes(household_id, created_at) where deleted_at is null` | The library's default order | Saves sorting the whole library for each page |
| Unique `chat_messages(chat_id, position)` | A chat's messages, and its last position | Order and integrity |
| `site_recipes(classic, opened_at)` | The weekly classics check (`read-job.ts`) | Scans the server's whole shelf |

**Queries that grow with a household:**

1. **Planning reads and parses the whole library three times.** **Fill the week** and the autoplan load every recipe, ingredient line and tag (`services/plan/suggest.ts`) and work out each line's food; sales for the suggestions do it again (`recipeFoods` in `services/stores/prices.ts`), and the budget a third time (`recipeCosts` in `services/stores/costs.ts`). `recipeCosts` also runs on the recipe and plan pages whenever a Kroger store has products, and `recipeFoods` for the library's **On sale** filter. Fix: one shared loader of plain rows, each line's food worked out once and kept (on `recipe_ingredients`, or cached by the recipe's `updatedAt`).
2. **Usual buys read every purchase ever,** on every visit to the list (`/api/list/usual`). Purchases grow by a few thousand rows a year. Fix: the last year or so, with the index above.
3. **"Same as…" rewrites the household in the request.** `rekeyHousehold` (`services/list/rekey.ts`, from `teach.ts`) rewrites every purchase, pantry item, placement, store product and list item. Fix: only the rows with one of the two keys involved, which `(household, food_key)` indexes already cover.
4. **Starter collections load the server's whole shelf** with its JSON on every view (`collections.ts`), and `libraryByUrl` puts every shelf address in one `IN` list, which on a big server could reach SQLite's or Postgres's limit on parameters. Fix: match against the household's own `source_url`s, and keep the shelf in memory until the next site read.
5. **Possible duplicates load every recipe and line** for each recently added recipe and the duplicates page (`services/recipes/duplicates.ts`), with an `IN` list of every recipe id. Fix: filter in SQL first (same source through its index), and `recipe: { deletedAt: null }` for the `IN` list.
6. **Every recipe update loads every tag** to prune the unused ones, inside the write (`pruneTags` in `services/recipes/tags.ts`). Fix: one `delete … where not exists`, or only the tags the recipe lost.
7. **Store mappings** (`services/stores/mappings.ts`) read every ingredient line (recently deleted recipes' too) and every purchase. Lower priority.
8. **Tables nothing clears:** `store_prices` (only 90 days are read), expired sessions, OAuth tokens, verifications and rate limits (unsure whether Better Auth clears sessions it never reads again), and resolved proposals. They go in `jobs.cleanUp`.

**SQLite runs one query at a time for the whole process.** better-sqlite3 has one connection behind a lock, and every `em.flush()` is a transaction, so requests and jobs wait on each other, and better-sqlite3 being synchronous means a long query or loading a whole library (problem 1) also stops everything else. The comment in `database/orm.ts` that "readers never wait on a writer" is only true between processes. This is the main reason a heavy job slows the app on SQLite, so moving work to jobs only helps if the jobs read less.

- WAL and `busy_timeout` are set once after start, not on each connection. Better in `onCreateConnection`, with `synchronous = normal` (safe with WAL), a bigger `cache_size`, `temp_store = memory` and a `pragma optimize` now and then; there are no planner statistics today.
- **Unsure, worth a test:** a fresh fork of the entity manager querying while a transaction is open (a cold settings cache in `services/settings/settings.ts`, the runner's `progress`) might wait on the lock that transaction holds.
- Postgres uses pg's default pool (10), shared with Better Auth, with no `statement_timeout`. Fine at household scale.

No text lookups use `lower(column)`: names, foods and emails are normalized before they're saved.

### The web app

- **Nothing is compressed.** No `hono/compress` and no precompressed assets: the first load is 44 files, 949 KB (about 318 KB if gzipped), before the signed-in app's own chunk. This is the biggest single win for phones and tunnels.
- **Static files go through sign-in and the database.** The web app is served after `authenticateRequests` (`app.ts`), so every asset request looks up the session and the active household. Serve the web app's files before sign-in, or skip it outside `/api`.
- **Heavy code loads on every page.**
  - The signed-in app's chunk is 234 KB with the AI SDK (the assistant's `ChatView` is imported eagerly) and driver.js.
  - react-markdown (134 KB) comes in through the sidebar's Update badge.
  - The better-auth client lands in the first load because `routes/verify.tsx` uses `safeReturnTo` in `validateSearch`.
  - `@merran/shared` is one 109 KB chunk with the foods vocabulary in it.
  - There are 219 chunks, 89 of them under 2 KB, mostly icons.
  - The Fraunces font loads every axis where one is used.
- **Switching back to the app refetches everything.** Queries go stale after 30 s and refetch when the window gets focus, so every app switch on a phone reloads the page's data, though the live stream already keeps it current.
- **Pages wait in a chain.** Sign-in check, then the page's code, then its data: Today and the library have no loaders, the plan page waits for the household before asking for the plan, and Today asks for the plan twice (first with a stand-in time zone, then the household's).
- **Today loads whole collections** (the full list, the pantry, 48 top-rated recipes) for a few counts and names.
- **Onboarding refetches** on every navigation and after every recipes, plan or list fetch, and saves progress on every load.
- **Nothing shows while a page loads,** so on slow Wi-Fi a tap looks like it did nothing.
- **Big imports and library runs set off refetch storms.** A `recipes` change refetches every recipe query, every loaded library page one after another, tags and Review. Nutrition and photo runs send one change per recipe, and each recipe imported from a link queues its own nutrition and photo jobs, each sending one. Every recipe write announces four areas, even read-only posts like stand-ins, and moving between pages closes and reopens the live stream, missing what happens in between.
- **Small tiles download the card photo.** Plan tiles and pickers (36–48 px) load the 800×600 card; there's no thumbnail size, and no image has `decoding="async"`.
- Long lists aren't virtualized; that's fine until a pantry has hundreds of things.

## The plan

Eight slices, each its own pull request (decided November 10, 2026), with its own short plan first. Slice 1's quick wins go together in one. Sizes: S is under a day, M a few days, L a week or more.

| # | Slice | What's in it | Size | Needs |
|---|---|---|---|---|
| 1 | **Quick wins** | Compression for the API and precompressed assets; static files before sign-in; the assistant, driver.js, markdown and the auth client loaded when needed; `keepPreviousData` on the library and pickers; live changes gathered for a second before refetching, and job-driven changes throttled; a longer `staleTime` and no refetch on focus while the live stream is connected; no nutrition or photo jobs that would do nothing; the missing indexes, the Postgres foreign keys first; Find more polling its own search, not the whole collection; a light "any sites followed?" query; no polling for stuck posts; the API descriptions that still say videos can't be imported | M in all, S each | — |
| 2 | **Job runner foundations** | Leaving full kinds out of the check; a quick lane and a long lane, with a setting; limits per household; time limits and Stop passed to fetches, AI and video tools; a retry schedule per kind; a household `job` event on the live stream; `GET /households/current/jobs`; a link import that remembers its progress across a restart | M | — |
| 3 | **Imports in the background, with a history** | One-link, video, extension, share-sheet and proposal imports become import jobs that hand over after about 10 s; uploaded files checked in a job; the **Imports** page ([below](#the-imports-page)): every import, the recipes each brought in, what didn't come in and why, **Delete**, **Undo** and **Try again**; a notice when one finishes; no more in-memory video queue | L | 2 |
| 4 | **The rest of the slow requests** | Receipts, **Work out nutrition**, **Make a photo**, **Check prices now** and **Empty** run as jobs; site photos fetched when the site is read; a time limit on text and photo imports | M | 2 |
| 5 | **Discover as it finds them, and Find more** | Each recipe saved as soon as it's opened (duplicates and the two-per-site rule applied as it goes); a pool of four instead of batches; progress and **Stop**; the cards found so far shown while it searches; matches from the shelf first, instantly and without AI; **Find more** adding to the same search; Discover photos resized like the shelf's. Later: the AI offering each link as it finds it, so the first card comes before the AI finishes | M | 2 for the events, otherwise none |
| 6 | **See more everywhere** | **See more** on each site's shelf, collections past 24, pickers past 50, and pages for the assistant's `search_recipes`; a thumbnail size for tiles. How search matches is left to the [search revamp](#later-the-search-revamp) | S–M | — |
| 7 | **Queries that grow** | One loader for planning, sales and costs that works out each line's food once; usual buys from the last year; "Same as…" touching only the rows it changes; the shelf kept in memory for collections; duplicates filtered in SQL; tags pruned in one statement; old prices, sessions, tokens and proposals cleared daily; SQLite's settings applied on each connection | M–L | — |
| 8 | **Loading the app** | Data started alongside each page's code (loaders), the household loaded with the sign-in check, one summary for Today, a progress bar while a page loads, `@merran/shared` split by use, small chunks grouped, the one font axis, onboarding's extra requests, and the live stream kept open across pages | M | — |

Slice 1 is cheap and felt on every page. Slice 2 is what 3, 4 and 5 build on, and what the webhooks plan needs (lanes and a retry schedule per kind), so it goes before webhooks. Slice 3 is the one asked for first, so it follows straight after. Decided November 10, 2026: build them in this order.

### The Imports page

Decided November 10, 2026, for slice 3. One list of everything that brought recipes in, so after several imports each can be checked on its own, and anything unwanted thrown out.

- **Where:** Recipes → ⋯ → **Imports**, with Manage tags, Review, Possible duplicates and Recently deleted. The page a link import opens today (`/recipes/import/$importId`) becomes an import's page here.
- **What's listed:** the household's imports, newest first: several links, a starter collection, a Mealie backup or export, a Paprika file, Mealie through its API, a Merran export, and a single link or video that went to the background (one that finished while you waited isn't listed; it just opened). Each says what it was, who started it, when, and how it's going or how it went: "Importing 12 of 52", or "48 came in, 3 already here, 1 didn't".
- **An import's page:**
  - **Came in:** each recipe it brought in, with its photo, linked to it, with a checkbox. **Delete** moves the ticked ones to Recently deleted.
  - **Already in your recipes:** each linked to the one that's there.
  - **Didn't come in:** each with why, and **Try again**, which starts a new import of just those. A Mealie connection asks for its token again, since it's forgotten once an import finishes.
- **Undo** moves everything the import brought in to Recently deleted, where it stays for 30 days. It asks first, saying how many, with every recipe ticked and the ones changed, planned or cooked since they came in marked as such; untick any to keep them. An undone import says so, with **Restore** while its recipes are still in Recently deleted. A running import is stopped first. For a Merran export, Undo covers its recipes; the household settings it brought stay as they are.
- **A notice when one finishes,** from the household `job` event (slice 2): "48 recipes imported", with **View**. Push notifications come later, with Notifications.
- **Kept 90 days,** with **Delete** for the record. Deleting the record never deletes recipes.
- **Who:** everyone who can add recipes sees every import. Delete and Undo need the right to delete recipes, as deleting one does. **Try again** on a file or Mealie import is for whoever could start one: household admins, and the server admin for Mealie through its API.
- **Data:** an `imports` table, scoped to the household (kind, what it was, who started it, its job, status, counts, every item's outcome and recipe, when it started, finished and was undone), since jobs are cleared after 30 days; and `recipes.import_id`, set to null if the record is deleted, marked `.index()` so Postgres gets an index too. Its routes replace `GET /recipes/import/links`, which lists only imports still going.

## Decisions

| # | Question | Recommendation |
|---|---|---|
| 1 | A single link: always in the background, or wait and hand over? | **Decided November 10, 2026: wait, then hand over.** Every one-link import is a job. The request waits about 10 s and opens the recipe if it's done; otherwise it says the recipe is importing, and the import goes on in the background, with a notice when it's in and its place on the Imports page. Most links take 1–3 s, so most people see no change. Video links hand over straight away, since they never finish in time. The same for the extension, the share sheet (its answer already has an `importId`) and an assistant's import proposal |
| 2 | Where the import history lives, and for how long | **Decided November 10, 2026: one list for every kind of import, in the Recipes page's ⋯ menu, kept 90 days, with each import's recipes, Delete and Undo** ([The Imports page](#the-imports-page)) |
| 3 | Full-text search | **Decided November 10, 2026: not in this plan.** How search matches, full-text search included, goes to a search revamp of its own, likely released with this work ([below](#later-the-search-revamp)) |
| 4 | How many jobs at once | **Decided November 10, 2026: two lanes.** A quick lane of 4 for jobs that call no AI, open no pages and finish in seconds (emails, webhook deliveries, telemetry, the update check, the daily clean-up), and a long lane of 4 for the rest (imports, library runs, Discover, reading sites, prices, the autoplan, note edits, rekeying foods). Each kind says which lane it's in; the long lane's size is a setting (`MERRAN_JOBS_LONG`) for bigger servers |
| 5 | How Discover's cards arrive | **Settled by the build order (November 10, 2026):** slice 2 comes before Discover, so its cards arrive through the household `job` event, and the 2 s poll goes |

## Later: the search revamp

Decided November 10, 2026: how search matches gets a revamp of its own, planned separately and likely released alongside this work. Meaning-based search, perhaps with pgvector, is the idea ("Recipe translations, step photos, meaning-based search" in [features.md](features.md), Later). What's here for it to start from:

- The [library search findings](#library-search): one phrase, no ranking, tags not searched by the text, ASCII-only case on SQLite. Matching each word separately with a simple ranking is the cheap fallback.
- The shelf (followed sites and starter collections) can't be searched at all, and the assistant's `search_recipes` says it matches tags but doesn't.
- SQLite is the default, so whatever's chosen needs an answer there too: pgvector is Postgres only. `sqlite-vec` is the SQLite counterpart, and at a household's size (a few thousand recipes) comparing vectors in memory would also do.
- Embeddings need a provider that makes them (OpenAI, Google, Ollama and others; Anthropic has none), so meaning-based search would be a module, off until it's set up, like the rest of Merran's AI, with the plain search still working without it.

## Docs that change with each slice

- [features.md](features.md): "Background jobs that survive restarts, with a jobs page", "Import from a link" and "Discover", and the import history's row (added as Planned on November 10, 2026).
- [platform.md](platform.md#jobs): the Jobs table (lanes, limits per household, what's a job now), and who can see a household's jobs.
- [stack.md](stack.md#a-job-runner-of-our-own-instead-of-hand-rolled-schedules): how jobs are claimed.
- The guides in `apps/docs/src/content/docs/docs/` for importing, Discover, receipts and the Jobs page; `run/configuration.md` for a new jobs setting.
- `openapi.json` and both `schema.d.ts` files for each API change; a migration for each index and for the import history.
