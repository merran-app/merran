# Speed, search and background work

Audited November 10, 2026. This is what's slow or feels slow, what still runs inside a request that should be a job, what search and Discover need, and which indexes are missing, split into slices to plan in detail and build one at a time. The order, the job lanes, imports and the Imports page were decided the same day ([Decisions](#decisions)); how search matches was left to a revamp of its own.

Checked again November 14, 2026, after webhooks were built (#95 to #100) ahead of slice 2: they built two of its pieces, leaving full kinds out of the check and a retry schedule per kind ([What webhooks built](#what-webhooks-built)). Slice 1, the quick wins, was built the same day ([What slice 1 built](#what-slice-1-built)), and slice 2, the job runner's foundations, on November 15, 2026 ([What slice 2 built](#what-slice-2-built)), followed the same day by slice 3, imports in the background with the Imports page ([What slice 3 built](#what-slice-3-built)). Slice 4 was planned on November 22, 2026 ([its plan](superpowers/plans/2026-11-22-slow-requests.md)), with decisions 6 to 9, and built on November 24, 2026: the rest of the slow requests ([What slice 4 built](#what-slice-4-built)). Slices 5 to 8 aren't built yet.

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

### What webhooks built

The webhooks pull requests changed the job runner (`services/jobs/runner.ts`, `jobs.ts`) on the way, so slice 2 starts from here:

- **Full kinds are left out of the check.** The runner's look for due work skips kinds already running as many as they may (`#dueJobs`), so a pile of one kind can't keep the rest waiting. [Finding 1](#the-job-runner) is fixed.
- **A retry schedule per kind.** A handler can give `retryDelays`; webhook deliveries use it for eight tries over about 27 hours. Without it, the wait still doubles from 30 seconds to 30 minutes. [Finding 9](#the-job-runner) is fixed.
- **A job knows which try it's on** (`attempt` and `maxAttempts` in its context), so it can tell when this is its last.
- **A job can be started over while it runs** (`restartJob`). How a try ended is only saved if the job is still on that try, so one started over runs again from its first try.
- **Jobs written with the change that makes them:** `createJob` and `wakeRunner` save a job in the same flush as everything else, and `atCommit` (`database/at-commit.ts`) writes a job's row as the transaction commits.
- **Jobs run as Merran** (`withActor(MERRAN, …)`), so webhooks say Merran did what a job did.
- **The daily clean-up** also clears webhook events and cooking sessions older than 30 days.
- **New kinds:** deliveries (two at a time), gathering (one at a time across the server), the heads-up schedule, and keyed jobs for cook view's timers, quiet checks and closing sessions.

The rest of slice 2 was built on November 15, 2026 ([What slice 2 built](#what-slice-2-built)).

### What slice 1 built

Built November 14, 2026, in one pull request, from [its plan](superpowers/plans/2026-11-14-quick-wins.md):

- **Compression.** API answers are gzipped (`hono/compress`), leaving streams as they are: the live stream and the assistant's replies arrive as they're written. The build writes a Brotli and a gzip copy of each text file of 1 kB or more (`apps/web/build/precompress.ts`), and the server sends whichever the browser takes. The built files are served before the database and sign-in.
- **A lighter first load.** The assistant's chat (the AI SDK and markdown) loads when it opens, driver.js when a tour starts, the release notes with the This server page, and the sign-in routes check their return address without the sign-in client (`features/auth/return-to.ts`). Measured with a manifest of the production build, counting what a signed-in first load downloads (the entry, its imports, and the signed-in layout's):

  | | Chunks | Raw | Gzip | Brotli |
  |---|---|---|---|---|
  | Before | 126 | 1,589 KB | 537 KB | 477 KB |
  | After | 110 | 1,125 KB | 394 KB | 350 KB |

  None of driver.js, react-markdown, the AI SDK or the better-auth client is in it now. Before, the signed-in layout alone added 628 KB raw; now 216 KB.
- **Searches that don't flash.** The library, the plan's Add a meal picker and a recipe's Goes with picker keep the last results, dimmed and marked busy, while the next ones load.
- **Fewer refetches.** Changes over the live stream are gathered before refetching (`features/live/gather.ts`), and while the stream works, the queries it covers stay fresh longer and aren't fetched again on coming back to the app (`features/live/state.ts`). For that, the stream now says when everything it covers changes: sharing to Merran, following sites, collections, Discover, applying or dismissing a suggestion, and a household's people, invites, shares, webhooks and imports announce their areas (`http/middleware/live.ts`), and a job kind can say what it changes (`changes` on a `JobHandler`), announced as it moves on and when it ends: link imports, app imports and Merran imports do. What still changes without a word (recipe sites read for the whole server, price checks, webhook deliveries, receipts read) isn't covered and is fetched again as before.
- **Fewer polls on Find.** `GET /api/sites/suggestions` says how many sites are followed and which to suggest, without their recipes, for the library's starter sites. A collection's Find more polls its own search (`GET /api/discover/{id}`), then fetches the collection once. Followed sites poll only while Merran is opening their posts.
- **No jobs that do nothing.** Saving a recipe queues nutrition only with a USDA key or AI for nutrition, and a photo only when photos are made by themselves and the household has a key for them. The jobs check again when they run, for a setting changed while they wait.
- **Indexes.** All 44 Postgres foreign keys without one (38 at the audit; webhooks and cooking added more), and a test that fails for any new foreign key without one; `jobs(status, run_at, created_at)` and `jobs(for_household_id, kind, status)`; `recipes(deleted_at)` where it isn't null, in place of the plain one; `recipes(household_id, created_at)` where `deleted_at` is null; and `site_recipes(classic, opened_at)`. MikroORM 7 declares partial indexes with an index's `where`, the same on both databases. The migrations only add and drop indexes.

Decided while building it (November 14, 2026):

- **Gathering live changes:** a person's for 1 second, Merran's (a job's, `by: null`) for 5. One change from a person brings what's waiting forward, and an area changed twice is refetched once.
- **Trusting the live stream:** it counts as working when something came over it in the last minute (the server pings every 25 seconds), not when it looks open, since a phone waking from sleep can have a stream that looks open with nothing coming. While it works, the queries it covers stay fresh for 5 minutes, not 30 seconds, and coming back to the app doesn't fetch them again. Queries with their own freshness keep it. A query counts as covered only when everything that changes its data says so on the stream; a write that doesn't would leave other devices showing old data until the page is opened again.
- **Stuck posts:** followed sites poll while a site is read for the first time, or while posts are waiting for up to 3 minutes after a read. A post a site refused stays waiting until the next read, hours later, so it no longer keeps the page asking.
- **Usual buys' index moves to slice 7.** `purchases(household_id, bought_on)` only helps once usual buys read the last year rather than everything, which is slice 7's.
- **No unique index on `chat_messages(chat_id, position)`.** `chat_id`'s index already finds a chat's messages, and a unique index would refuse to migrate a server where two sends once raced to the same position.

### What slice 2 built

Built November 15, 2026, in one pull request, from [its plan](superpowers/plans/2026-11-15-job-runner-foundations.md), on top of slice 1:

- **Two lanes.** Each kind says whether it's quick or long (`lane` on a `JobHandler`). The quick lane holds 4: emails, webhook deliveries, gathering and heads-ups, cook view's timers, telemetry, the update check and the daily clean-up. The long lane holds 4 unless `MERRAN_JOBS_LONG` says otherwise (1 to 32): imports, library runs, Discover, reading sites, prices, the autoplan, note edits, rekeying foods and purging Recently deleted. A full lane's kinds are left out of the look for due work, as kinds at their limit already were. [Finding 2](#the-job-runner) is fixed.
- **Limits per household.** A kind can say how many one household runs at once (`perHousehold`): one, for every import, Discover search, note edit, price check and autoplan. A household at that limit is left out of the look for due work too, so one household's hundred waiting jobs can't fill the places it takes in. Library runs keep only their kind's limit (below). [Finding 3](#the-job-runner) is fixed.
- **Stop and time limits.** The runner keeps a job's stop signal for the length of its run (`services/jobs/stop.ts`, like `withActor`), and the fetcher, `useAi`, pictures, speech, transcription and yt-dlp and ffmpeg combine it with their own limits, so Stop ends what a job is doing at once. What a job was on when it stopped isn't counted as failed (library runs and Discover rethrow it), a link or app import doesn't save a recipe without the photo it was fetching, and a job stopped is stopped whatever its handler returns: cancelled, or run again at the next start. Every AI call through `useAi` gives up after 3 minutes in a job (5 for Discover) and 90 seconds in a request, and says "The AI took too long to answer" (`ai_timeout`); the model is wrapped once there, so no feature has to pass the limit. That covers the imports still in a request until slices 3 and 4 too. [Finding 4](#the-job-runner) is fixed.
- **The household `job` event.** The live stream sends `job` with a job's `id`, `kind`, `status` and `progress` when one of a household's jobs starts, saves its progress and ends, to everyone who may read the kind's `area` (recipes for imports, library runs and Discover; household for a Merran export; list for prices; plan for the autoplan). Every Stop and Cancel goes through the runner (`jobs.cancel`), so a waiting job cancelled says so too. The web app refreshes the job and what shows it a second after each move (`features/live/jobs.ts`), and its pages following imports, library runs and Discover ask only every 30 seconds while the stream works, at the old pace when it doesn't. Followed sites (while Merran opens their posts) and the server admin's Jobs card poll as before. [Finding 5](#the-job-runner) is fixed.
- **A household's jobs.** `GET /households/current/jobs` lists the newest 100, or those in one status, for household admins, like the routes beside it. The page for them comes with slice 3's Imports page. [Finding 6](#the-job-runner) is partly fixed.
- **A link import that carries on.** A job sees what it saved so far (`saved` in its context). A link import cut off by a restart keeps the links it got through and carries on from the one it was on; a link it was fetching when stopped shows as stopped, not failed. [Finding 8](#the-job-runner) is fixed.
- **The docs.** [stack.md](stack.md#a-job-runner-of-our-own-instead-of-hand-rolled-schedules) says jobs are taken by a conditional update, and [platform.md](platform.md#jobs) has the lanes, the limits per household, and the classics check and prep reminders marked as not jobs yet. [Finding 10](#the-job-runner) is fixed.

Decided while building it (November 15, 2026):

- **No cap on a household's share of a lane.** Most servers have one household, whose jobs a cap would leave waiting with places free. Each kind's limit, `perHousehold` and the fair-share order already keep one household's imports from blocking another's.
- **No time limit on a whole job.** A link import of 100 links, or a big Merran export, can rightly take an hour. The limits are on what can hang: each fetch, AI call and video tool.
- **Stop is carried, not passed.** A job's stop signal is kept in AsyncLocalStorage for its run, so a fetch or AI call added later gets it without anyone remembering to pass it through.
- **Who hears a job's moves:** whoever may read its area, so an API key that only reads the list hears about price checks and nothing else. The event says only how far the job has got; what it did is fetched with what shows it, like the import.
- **A job's moves are gathered apart from Merran's changes.** They refresh the job a second after it moves, but don't bring the 5 seconds slice 1 gives Merran's changes forward: an import says both as it goes, and the library would otherwise be fetched every second.
- **Library runs have no limit per household.** Nutrition, photos and tidy-ups for a whole library share their kinds with each saved recipe's own, and a library run can take an hour (USDA's hourly limit makes nutrition wait). One per household would leave a recipe saved meanwhile without its nutrition or photo until the run ends.
- **90 seconds for AI in a request, 3 minutes in a job.** A request's AI call gives up under the 100 seconds Cloudflare's tunnel waits, so people on the tunnel see why rather than the tunnel's error page.

### What slice 3 built

Built November 15, 2026, in one pull request, from [its plan](superpowers/plans/2026-11-15-imports.md), on top of slice 2:

- **One link as a job.** Every one-link import, from Add a recipe, the extension, the share sheet, an assistant's proposal, Tonight's idea and the shelf, is a `recipes.importLink` job (three at a time, two per household). The request waits up to 10 seconds and answers with the recipe if it's done, or 202 with the import (`ImportStarted`), and the app says "Still importing. It'll be in your recipes soon." with **View**. [Decision 1](#decisions) is built, and the first row of [Work still inside a request](#work-still-inside-a-request) is fixed.
- **Videos as jobs.** A video link is a `recipes.importVideo` job (two at a time, one per household) and hands over at once; the in-memory download queue is gone, so a restart doesn't lose one and a tunnel's limit doesn't cut it off. Several links bring their videos in with the rest when video import is on. The second row is fixed.
- **Uploaded files checked in a job** (`recipes.checkFile`). The upload waits up to 2 seconds for the check, then answers 202, and the card says "Checking the file…" until `GET /households/current/import/files/{fileId}` says it's ready. Paprika files are unzipped without blocking. The third row is fixed.
- **The Imports page,** as [planned](#the-imports-page): Recipes → ⋯ → **Imports** lists every import of the last 90 days; an import's page has **Came in** (tick and delete), **Already in your recipes** and **Didn't come in**, a hundred at a time, with **Stop**, **Try again**, **Undo**, **Restore** and **Delete the record**. Settings' import cards say **See the import**, the Recipes banner follows imports going, and the old link-import page leads here.
- **The data:** `imports` (kind, what it was, who, status, counts, tag, what Try again needs, when it finished and was undone, and how many Undo moved) and `import_items` (each link or recipe in order, its outcome, recipe and why). An import's id is its job's. Imports are cleared after 90 days, and a single link's unlisted record after a day.
- **The API:** `GET /imports`, `GET` and `DELETE /imports/{importId}`, and its `stop`, `undo`, `restore` and `retry`. `GET /recipes/import/links`, `GET /recipes/import/links/{importId}` and its `stop` are gone (a breaking change). Several links and a collection answer with the import; webhooks' `url` for an import points at its page on the Imports page.
- **A notice when one's in.** The `job` event says who started it (`startedBy`); when one of yours ends, the app fetches it and, if it's listed, says "12 recipes imported.", "Lemon Chicken is in your recipes.", "Nothing new came in: it was all in your recipes already." or "An import didn't work.", with **View**. [Following background work](#following-background-work) is fixed.
- **Not in it:** a page for a household's other jobs ([finding 6](#the-job-runner) stays partly fixed), and push notifications, which come with Notifications.

Decided while building it (November 15, 2026):

- **`import_items` rather than `recipes.import_id`.** The page needs a row for each link or recipe that was already there or didn't come in, with its name and why, so items need a table anyway, and each item's recipe says what came in. A foreign key on `recipes` would make SQLite rebuild that table, which cascades into its child rows.
- **An import's id is its job's id,** so old links to `/recipes/import/{id}` open the import's page, and the job needs no foreign key (jobs are cleared after 30 days, imports after 90).
- **One link always makes a record, listed only when it hands over,** so a job finishing just as the request gives up can't lose its record. The API says whether an import is listed, and the app tells no one about a link they watched open.
- **Undo keeps what's unticked** (`keep`), so everything else goes, beyond the hundred shown too, and an undone import says how many went, which can be fewer than came in.
- **The notice goes to whoever started the import,** on every device they have open, and only when it ended on its own: whoever stopped one knows. Others in the household see it on the Imports page.
- **Try again on a file needs the file.** An upload is kept a week after an import with failures; past that, Try again says to upload it again. Mealie through its API asks for its token again.
- **A links import's list of links shows while it runs;** once it's over, the three lists say the same with what can be done about it.
- **No `import.finished` webhook for a single link:** its `recipe.created` says it's in.
- **Imports from before this release aren't listed,** except one still running when Merran restarts, whose job makes its record.
- **Changed, planned or cooked since it came in:** changed is a version saved after it came in, other than its import's; planned is any plan entry with it; cooked is a cook note since or `lastMadeAt` after it came in.

### What slice 4 built

Built November 24, 2026, in one pull request, from [its plan](superpowers/plans/2026-11-22-slow-requests.md), on top of slice 3:

- **Wait, then hand over, for any job** (`services/jobs/hand-over.ts`). The request waits up to 10 seconds and answers as before if the job is done; otherwise it answers 202 with the job, marked handed over (`Job.handedOver`), so whoever started it hears when it ends. A job that ends just as the wait runs out answers as done and isn't marked handed over. `GET /households/current/jobs/{jobId}` is open to household admins and to whoever started the job; everyone else gets 404, as for a job in another household. [Decision 6](#decisions) is built.
- **Work out nutrition and Make a photo as jobs** (`recipes.workOutNutrition`, `recipes.makePhoto`), keyed by recipe, so a second press, or a second device, joins the one going. The errors that were instant stay instant: no servings, no ingredients, no USDA key and no AI, photos off, a real photo already, no OpenAI or Google key. The photo's `recipe.updated` webhook says the person who asked did it.
- **A recipe says what's being done for it** (`Recipe.working`: nutrition, photo). While it has work going, the recipe page says "Working out nutrition…" or "Making a photo…" and the button waits, after a reload too.
- **Check prices now as a job** (`stores.prices`, the household's existing key). Pressed while a check from the half-hourly look or a store change is waiting, it joins that check and makes it the person's own. `StoresStatus.kroger.checkingPrices` says one is going, and the button says "Checking prices…".
- **A scanned receipt is read in a job** (`pantry.readReceipt`). It's saved as reading, with its uploads, and filled in by the job. A receipt has a status: reading, ready, recipe (it was a recipe), none (no receipt in it) or failed (`error` says why). A read cut off by a restart runs again at the next start, from the uploads, which go only once the read is saved. The share sheet's and the assistant's receipts stay in their requests ([decision 8](#decisions)). [Decision 7](#decisions) is built: the scan page holds on past 10 seconds, with the files kept, so **Add it as a recipe** still works if it was a recipe; left, the receipt is under Waiting receipts as "Reading…".
- **Deleting recipes for good removes the recipes at once** (**Empty**, **Delete for good**, deleting picked ones and the daily purge) and leaves their photos to a `files.remove` job, saved with the delete. [Decision 9](#decisions) is built.
- **A site recipe's photo is fetched when the site is read:** each recipe that opens as the site is read, and up to 6 older ones without a photo each read. The photo route still fetches one that wasn't fetched yet.
- **The web app follows these jobs:** the recipe page, the stores card, the scan page, Waiting receipts and the receipt page follow the work over the live stream, and ask again every few seconds when the stream isn't working, so "Working…" or "Reading…" never sticks.
- **A notice to whoever started a handed-over job,** when it's done or didn't work, with **View**: the recipe, Settings → Shopping, or the receipt.
- **Not in it:** the share sheet's receipts as a job (decision 8). Photos and prices weren't seen in a browser end to end (a test server can't make AI photos without a real OpenAI or Google key, nor check Kroger without an app); their server tests cover them.

Decided while building it (November 24, 2026):

- **What a recipe is "working" on includes what a save queued,** not only the button's job: showing it keeps a press during the save's job from paying for a second run.
- **A press of Check prices now joins a waiting check and makes it the person's own,** so it answers like a check they started: errors come back to them with their status, and they hear when it ends.
- **A receipt that wasn't read gets its own notice,** "Couldn't read your receipt. {why}"; "That wasn't a receipt Merran could read." is for one that was a recipe or had no receipt in it.
- **No notice for a receipt you watched being read:** while the scan page follows it, its notice is skipped, as slice 3 tells no one about a link they watched open; leave the page and the notice comes.
- **A receipt that wasn't read, watched on the scan page, isn't kept,** as one found to be a recipe within the wait isn't (a 422).
- **Following the work doesn't rely on the live stream alone:** pages showing work going on ask again every few seconds while the stream isn't working, since a stream that's down, or a save's own run that stops early, would otherwise leave "Working…" up.
- **A stopped receipt read is marked failed, not left reading** ("It was stopped before it was read."); only a restart leaves it reading, to be read again.
- **A scanned receipt's pasted text waits with its files,** as an upload in the receipt's folder, not in the job's payload, so it goes with them once the receipt's read (or with the receipt, a day later at most) rather than staying for the 30 days a job is kept.
- **Discarding a receipt that's still being read stops its read,** so the model isn't asked, and paid, for a receipt nobody wants.
- **The photo removal job isn't limited per household,** runs one at a time, and stops between files.
- **Jobs someone's waiting on go first.** Every kind a request waits on before handing over says so (`waitedOn`): `recipes.workOutNutrition`, `recipes.makePhoto`, `stores.prices`, `pantry.readReceipt`, and slice 3's `recipes.importLink` and `recipes.checkFile`. The runner looks for their due jobs first, then for the rest in the places left, so when a place in the long lane frees, one of them takes it ahead of older background work, like the nutrition and photos a big import queued, which could otherwise fill every place looked at. No place is kept for them, and every limit stays as it was (each kind's, each lane's, each household's, and the fair share): only the order of the look changes. The checks the half-hourly look queues share `stores.prices`, and go first too; they're one per household.
- **A job runs as it is when it's taken,** read again once the runner has taken it, so a change made while it waited, like Check prices now joining a waiting check and making it the presser's, isn't missed when the runner found the job just before.
- **A job is followed by API keys through what it works on.** `GET /households/current/jobs/{jobId}` stays for signed-in sessions; a key client follows the recipe's `working`, the receipt's `status`, `kroger.checkingPrices` on the stores status, or the live `job` event, as the API guide says.
- **What broke inside a job isn't shown to people.** A job that fails for good answers a request still waiting with `job_failed`, "That didn't work. Try again in a moment.", and its notice says "Something Merran was working on didn't finish."; its raw error (SQL, a file path) stays on the job for the server admin's Jobs card and goes to error tracking, as an unexpected error in a request does. An error that's the person's to see comes back as the job's result, with its own status.

## Findings

### Work still inside a request

| Where | What it does | Can take | Should be | Size |
|---|---|---|---|---|
| Import from a link (`POST /recipes/import`, `services/recipes/import/import-link.ts`), and the same import from the extension (`import/page`), the share sheet (`services/share/share.ts`) and an assistant's import proposal | Fetches the page (60 s through FlareSolverr), reads it with AI when there's no recipe data, downloads up to 5 photos and resizes them | 1–3 s usually, 10–30 s with AI, over 2 minutes at worst | A one-link import job. The request waits a few seconds and hands over if it isn't done. Built in slice 3 (November 15, 2026) | M |
| Video links (`isVideoLink` → `video/import.ts`) | yt-dlp, ffmpeg, transcription of up to 30 minutes, vision AI. Waits first in an in-memory queue of 2 downloads for the whole server (`video/tools.ts`), lost on a restart | Often minutes: past Cloudflare's 100 s limit, so tunnelled servers time out | Always a job. The most important one here. Built in slice 3 (November 15, 2026) | in the above |
| Checking an uploaded Mealie or Paprika file (`households/current/import/files`, `services/recipes/import/apps/files.ts`) | Parses every recipe; Paprika files are unzipped with `gunzipSync`, embedded photos included | Seconds to a minute, and it blocks every other request and job meanwhile | Checked in a job ("Checking the file…"), unzipped without blocking. Built in slice 3 (November 15, 2026) | M |
| Reading a receipt (`services/pantry/receipts/receipts.ts`) | Rotates and tiles the photos with sharp, then one vision AI call | 10–60 s | Saved as "reading"; a job fills it in and says when it's ready to review. Built in slice 4 (November 24, 2026), except the share sheet's and the assistant's receipts, which stay in the request (decision 8) | M |
| **Work out nutrition**, **Make a photo**, **Check prices now** | USDA searches one after another (about 40 calls for a 20-ingredient recipe nobody's matched before); image generation; up to 50 Kroger searches and an AI pick | Up to minutes | The nutrition, photo and price jobs that exist, run for one recipe or now. The request waits up to 10 s and hands over if it isn't done. Built in slice 4 (November 24, 2026) | S each |
| **Empty** Recently deleted (`services/recipes/deleted.ts`) | Removes each recipe's files, one network call each on S3 | Long on S3 | The purge job. Built in slice 4 (November 24, 2026): the recipes go at once and a job removes their photos | S |
| Photos of site recipes (`sites/recipes/[recipe]/photo`, `shelf.ts`) | Fetched and resized the first time someone looks | 24 fetches from other sites when a collection opens | Fetched when the site is read. Built in slice 4 (November 24, 2026) | S |
| Import from text or photos (`import-with-ai.ts`) | One AI call | 5–40 s | Stays in the request, with a time limit. Fixed by slice 2's time limit: the call gives up after 90 s in a request (November 15, 2026) | S |

Fine in the request: the assistant's streamed replies, a tidy-up suggestion, swaps, stand-ins, voice, sending to Kroger, and the household export (it streams). Kroger's basket review (5–60 s on a long list) is interactive, so it stays for now.

Across all of it, **AI calls have no time limit** (`useAi` in `services/ai/run.ts` passes no abort signal), and jobs don't pass their stop signal to the fetcher or the AI, so **Stop** only takes effect between items, and a provider that hangs keeps its slot until Merran restarts.

### The job runner

1. **One full kind holds up the rest.** Each check took the 50 oldest due jobs of any kind (`runner.ts`), then skipped kinds already at their limit. A 100-link import queues up to 100 nutrition and 100 photo jobs, limited to a few at a time, which filled those 50 places, so other kinds and other households waited while slots were free. Fixed with webhooks (#95, November 10, 2026): kinds at their limit are left out of the query.
2. **Four slots for everything,** with no priority and no setting. Invitation and password reset emails wait behind long AI runs, and webhook deliveries (two at a time) and gathering (one) share the same four with them: a big link import and the nutrition and photo jobs it queues fill all four, and deliveries wait. Fix: a lane for quick jobs (emails, webhook deliveries) apart from long ones (imports, library runs, Discover), and a setting for the long lane (decided; see [decision 4](#decisions)). Fixed in slice 2 (November 15, 2026).
3. **Limits are for the whole server, and a whole import is one job.** [platform.md](platform.md#jobs) promises "three pages or one video at a time per household", but two big imports from one household block every household's link imports for as long as they take. Fix: limits per household as well as per kind. Fixed in slice 2 (November 15, 2026): one import or Discover search of a kind at a time per household.
4. **No time limits, and Stop isn't passed on** (above). Fixed in slice 2 (November 15, 2026).
5. **Nothing says when a job moves.** The runner sends no events, so the web app runs about eight polling loops on six different APIs: a link import every second, the Recipes banner every 2 s, a household import every second, tidy-up every 2 s, nutrition and photo runs every 3 s, Discover every 2 s, sites every 5 s, and the server's jobs every 2 or 30 s. Link, app and household imports never announce a change, so other tabs and phones don't refresh. Fix: a household `job` event on the live stream when a job starts, moves on and finishes, and one way for the web app to follow any job. Partly fixed in slice 1 (November 14, 2026): link, app and Merran imports now announce the recipes they bring in as they go; the polling loops and the `job` event are still to do. Fixed in slice 2 (November 15, 2026): the `job` event, followed by the pages for imports, library runs and Discover.
6. **A household can't see its own jobs.** Only the server admin's Jobs card lists them (the 100 newest), and it has labels for 8 of the 18 kinds. Partly fixed in slice 2 (November 15, 2026): `GET /households/current/jobs`; the page and the labels are still to do.
7. **Jobs that do nothing.** Every save queues a nutrition job and a photo job even when the household has no USDA key, no AI and no photos; each then just ends (`services/nutrition/runs.ts`, `services/recipes/photos/runs.ts`), and its row stays for 30 days. Fix: check before queueing. Fixed in slice 1 (November 14, 2026).
8. **A link import forgets what it did when Merran restarts.** It starts again from its payload and ignores its saved result (`import-links.ts`), so links it already imported are reported as already in the library. Fixed in slice 2 (November 15, 2026).
9. **One retry schedule for every kind.** Fixed with webhooks (#95, November 10, 2026): a handler can give its own `retryDelays`.
10. **The docs don't match.** [stack.md](stack.md#a-job-runner-of-our-own-instead-of-hand-rolled-schedules) says jobs are claimed with `SKIP LOCKED` on Postgres; the runner uses a conditional update, which is right for one process. [platform.md](platform.md#jobs) lists a weekly classics check and prep reminders, which have no job yet. Fixed in slice 2 (November 15, 2026).

### Following background work

- **Several links:** a job. The import's page polls every second, and Recipes shows a banner. You can leave and come back. But the list only shows imports still going (`activeLinkImports`); once one finishes it can only be reached by its address, its job is deleted after 30 days, and nothing says it's finished.
- **Mealie, Paprika and Merran files:** jobs, but the job is only remembered by the Settings card that started it (`app-import-card.tsx`, `import-card.tsx`). Leave Settings and the progress is gone, with no way back to it. The first 50 failures are kept, and only that card shows them.
- **One link, a video, text or photos:** the dialog waits for the request.
- **Mealie, for comparison** (from memory, not checked): every bulk import and migration leaves a report listing each item and whether it worked, kept until someone deletes it.

So what's missing is a household **Imports** page listing every import, how it went and what failed and why, with **Try again** for the failures, and a notice when an import finishes. Built in slice 3 (November 15, 2026): the Imports page, and a notice to whoever started an import when it's in.

### Library search

- **It feels slow because it flashes.** Each new search swaps the grid for skeletons (there's no `placeholderData` on the library's query), though the query itself takes milliseconds. The plan's and pairings' recipe pickers do the same. Fixed in slice 1 (November 14, 2026).
- **Matching is one phrase.** `%chicken soup%` against the name, the description and ingredient lines, so "chicken soup" doesn't find "Soup with chicken". Nothing is ranked (a name match doesn't beat an ingredient match), tags aren't searched by the text, and SQLite only ignores case for ASCII letters.
- **Every recipe change reloads every loaded page** of the library (below, under the web app).
- **The pickers stop at 50,** and their 36 px tiles download the 800×600 card photo.
- **Full-text search isn't worth it for speed yet.** The dev household has 57 recipes and 893 ingredient lines; even 30,000 lines is a scan of a few milliseconds. FTS5 and Postgres `tsvector` would only add word stems and ranking, with two implementations to keep. Matching each word separately, plus a simple ranking, gets most of the benefit.
- How search matches is left to its own revamp ([below](#later-the-search-revamp)); only the flashing (slice 1) and the pickers' limit (slice 6) are fixed here.

### Discover and the shelf

- **Discover shows nothing until it's all done.** One AI call with web search picks 10–12 links; the pages are opened four at a time, each four waiting for the slowest (up to 15 s); a second AI round runs if fewer than four opened; then the best 8 (two per site at most) are saved together at the end (`services/recipes/discover/discover.ts`). The web app polls all 12 recent searches every 2 s and shows skeletons until then. The first result arrives with the last, roughly 30 s to 2 minutes and more with a second round (estimated, not measured). It reports no progress and ignores **Stop**.
- **No Find more on Discover.** Only a collection's Find more tells the search what's already been shown, so the same search again can bring the same dishes.
- **Discover's photos are the sites' full-size images,** linked directly rather than resized like shelf photos.
- **The Sites tab** makes four queries per followed site (`listSites`), shows 24 of the 120 kept for each with no way to see more, and polls every 5 s while any site has posts waiting. A post refused with 403 or 429 stays waiting, so that polling can go on for hours (how often this happens is unsure). The Recipes page loads all of it, poll included, just to know whether any site is followed (`SitesStart`). Fixed in slice 1 (November 14, 2026): the polling stops 3 minutes after a read, and the Recipes page asks `GET /api/sites/suggestions`. The four queries per site and the 24 shown are still to do.
- **Followed sites' spotlight** takes the newest 24 and then drops the ones that don't suit the household, in the browser, so it can show very few, with no more to see.
- **Starter collections** load the whole shelf (up to about 1,400 recipes, ingredients included) on every request, check the household's tastes on each and run the rules in JavaScript; each shows 24, with no more. During Find more the page polls every 2 s, repeating all of that each time. Fixed in slice 1 (November 14, 2026): Find more polls its own search, and the collection is fetched once when it's done.
- **The shelf can't be searched** anywhere.

### The database

**Postgres has 38 foreign keys with no index.** MikroORM only indexes foreign keys by itself on SQLite; on Postgres, only the ones an entity marks `.index()` (the `householdRef()` and `recipeRef()` helpers and a few more). The ones that matter:

- `plan_entries.recipe_id` and `with_recipe_id`: every meal saved or cooked looks up when its recipes were last made (`remade()` in `services/plan/plan.ts`), and every recipe deleted for good cascades into the plan, so both scan years of plan entries.
- `recipe_pairings.paired_recipe_id`: cascades on delete.
- The rest (users, aisles, lists, secrets, jobs) only cost a scan when one of those is deleted.

Marking them `.index()` should leave the SQLite migration empty, since SQLite has indexes by the same names already (to check when it's generated).

Fixed in slice 1 (November 14, 2026), with 44 by then, and the SQLite migration did leave them alone. A test now holds every foreign key to an index. Of the indexes below, all but usual buys' (moved to slice 7) and the unique one on `chat_messages` (left out) were added: see [What slice 1 built](#what-slice-1-built).

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

- **Nothing is compressed.** No `hono/compress` and no precompressed assets: the first load is 44 files, 949 KB (about 318 KB if gzipped), before the signed-in app's own chunk. This is the biggest single win for phones and tunnels. Fixed in slice 1 (November 14, 2026).
- **Static files go through sign-in and the database.** The web app is served after `authenticateRequests` (`app.ts`), so every asset request looks up the session and the active household. Serve the web app's files before sign-in, or skip it outside `/api`. Fixed in slice 1 (November 14, 2026).
- **Heavy code loads on every page.**
  - The signed-in app's chunk is 234 KB with the AI SDK (the assistant's `ChatView` is imported eagerly) and driver.js.
  - react-markdown (134 KB) comes in through the sidebar's Update badge.
  - The better-auth client lands in the first load because `routes/verify.tsx` uses `safeReturnTo` in `validateSearch`.
  - These three are fixed in slice 1 (November 14, 2026). The rest of this list is slice 8's.
  - `@merran/shared` is one 109 KB chunk with the foods vocabulary in it.
  - There are 219 chunks, 89 of them under 2 KB, mostly icons.
  - The Fraunces font loads every axis where one is used.
- **Switching back to the app refetches everything.** Queries go stale after 30 s and refetch when the window gets focus, so every app switch on a phone reloads the page's data, though the live stream already keeps it current. Fixed in slice 1 (November 14, 2026), for the queries the live stream covers, while it works.
- **Pages wait in a chain.** Sign-in check, then the page's code, then its data: Today and the library have no loaders, the plan page waits for the household before asking for the plan, and Today asks for the plan twice (first with a stand-in time zone, then the household's).
- **Today loads whole collections** (the full list, the pantry, 48 top-rated recipes) for a few counts and names.
- **Onboarding refetches** on every navigation and after every recipes, plan or list fetch, and saves progress on every load.
- **Nothing shows while a page loads,** so on slow Wi-Fi a tap looks like it did nothing.
- **Big imports and library runs set off refetch storms.** A `recipes` change refetches every recipe query, every loaded library page one after another, tags and Review. Nutrition and photo runs send one change per recipe, and each recipe imported from a link queues its own nutrition and photo jobs, each sending one. Every recipe write announces four areas, even read-only posts like stand-ins, and moving between pages closes and reopens the live stream, missing what happens in between. Partly fixed in slice 1 (November 14, 2026): changes are gathered for a second, and a job's for five, so a burst is one round of refetches. Announcing fewer areas and keeping the stream open across pages are still to do.
- **Small tiles download the card photo.** Plan tiles and pickers (36–48 px) load the 800×600 card; there's no thumbnail size, and no image has `decoding="async"`.
- Long lists aren't virtualized; that's fine until a pantry has hundreds of things.

## The plan

Eight slices, each its own pull request (decided November 10, 2026), with its own short plan first. Slice 1's quick wins go together in one. Sizes: S is under a day, M a few days, L a week or more.

| # | Slice | What's in it | Size | Needs |
|---|---|---|---|---|
| 1 | **Quick wins** (built November 14, 2026: [what it built](#what-slice-1-built)) | Compression for the API and precompressed assets; static files before sign-in; the assistant, driver.js, markdown and the auth client loaded when needed; `keepPreviousData` on the library and pickers; live changes gathered for a second before refetching, and job-driven changes throttled; a longer `staleTime` and no refetch on focus while the live stream is connected; no nutrition or photo jobs that would do nothing; the missing indexes, the Postgres foreign keys first; Find more polling its own search, not the whole collection; a light "any sites followed?" query; no polling for stuck posts; the API descriptions that still say videos can't be imported | M in all, S each | — |
| 2 | **Job runner foundations** (built November 15, 2026: [what it built](#what-slice-2-built)) | A quick lane and a long lane, with a setting; limits per household; time limits and Stop passed to fetches, AI and video tools; a household `job` event on the live stream; `GET /households/current/jobs`; a link import that remembers its progress across a restart. Leaving full kinds out of the check and a retry schedule per kind came with webhooks ([What webhooks built](#what-webhooks-built)) | M | — |
| 3 | **Imports in the background, with a history** (built November 15, 2026: [what it built](#what-slice-3-built)) | One-link, video, extension, share-sheet and proposal imports become import jobs that hand over after about 10 s; uploaded files checked in a job; the **Imports** page ([below](#the-imports-page)): every import, the recipes each brought in, what didn't come in and why, **Delete**, **Undo** and **Try again**; a notice when one finishes; no more in-memory video queue | L | 2 |
| 4 | **The rest of the slow requests** (built November 24, 2026: [what it built](#what-slice-4-built)) | Receipts, **Work out nutrition**, **Make a photo**, **Check prices now** and **Empty** run as jobs; site photos fetched when the site is read; a time limit on text and photo imports (already there from slice 2) | M | 2 |
| 5 | **Discover as it finds them, and Find more** | Each recipe saved as soon as it's opened (duplicates and the two-per-site rule applied as it goes); a pool of four instead of batches; progress and **Stop**; the cards found so far shown while it searches; matches from the shelf first, instantly and without AI; **Find more** adding to the same search; Discover photos resized like the shelf's. Later: the AI offering each link as it finds it, so the first card comes before the AI finishes | M | 2 for the events, otherwise none |
| 6 | **See more everywhere** | **See more** on each site's shelf, collections past 24, pickers past 50, and pages for the assistant's `search_recipes`; a thumbnail size for tiles. How search matches is left to the [search revamp](#later-the-search-revamp) | S–M | — |
| 7 | **Queries that grow** | One loader for planning, sales and costs that works out each line's food once; usual buys from the last year; "Same as…" touching only the rows it changes; the shelf kept in memory for collections; duplicates filtered in SQL; tags pruned in one statement; old prices, sessions, tokens and proposals cleared daily; SQLite's settings applied on each connection | M–L | — |
| 8 | **Loading the app** | Data started alongside each page's code (loaders), the household loaded with the sign-in check, one summary for Today, a progress bar while a page loads, `@merran/shared` split by use, small chunks grouped, the one font axis, onboarding's extra requests, and the live stream kept open across pages | M | — |

Slice 1 is cheap and felt on every page. Slice 2 is what 3, 4 and 5 build on, and what webhooks need (lanes and a retry schedule per kind). Slice 3 is the one asked for first, so it follows straight after. Decided November 10, 2026: build them in this order. Webhooks were built first in the end, with the retry schedule and full kinds left out of the check; the lanes are still to come in slice 2, and until then deliveries share the four slots with long jobs.

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
- **Data:** an `imports` table, scoped to the household (kind, what it was, who started it, its job, status, counts, every item's outcome and recipe, when it started, finished and was undone), since jobs are cleared after 30 days; and `recipes.import_id`, set to null if the record is deleted, marked `.index()` so Postgres gets an index too. Its routes replace `GET /recipes/import/links`, which lists only imports still going. Built with an `import_items` table instead of `recipes.import_id` (November 15, 2026; [What slice 3 built](#what-slice-3-built)).

## Decisions

| # | Question | Recommendation |
|---|---|---|
| 1 | A single link: always in the background, or wait and hand over? | **Decided November 10, 2026: wait, then hand over.** Every one-link import is a job. The request waits about 10 s and opens the recipe if it's done; otherwise it says the recipe is importing, and the import goes on in the background, with a notice when it's in and its place on the Imports page. Most links take 1–3 s, so most people see no change. Video links hand over straight away, since they never finish in time. The same for the extension, the share sheet (its answer already has an `importId`) and an assistant's import proposal |
| 2 | Where the import history lives, and for how long | **Decided November 10, 2026: one list for every kind of import, in the Recipes page's ⋯ menu, kept 90 days, with each import's recipes, Delete and Undo** ([The Imports page](#the-imports-page)) |
| 3 | Full-text search | **Decided November 10, 2026: not in this plan.** How search matches, full-text search included, goes to a search revamp of its own, likely released with this work ([below](#later-the-search-revamp)) |
| 4 | How many jobs at once | **Decided November 10, 2026: two lanes.** A quick lane of 4 for jobs that call no AI, open no pages and finish in seconds (emails, webhook deliveries, telemetry, the update check, the daily clean-up), and a long lane of 4 for the rest (imports, library runs, Discover, reading sites, prices, the autoplan, note edits, rekeying foods). Each kind says which lane it's in; the long lane's size is a setting (`MERRAN_JOBS_LONG`) for bigger servers |
| 5 | How Discover's cards arrive | **Settled by the build order (November 10, 2026):** slice 2 comes before Discover, so its cards arrive through the household `job` event, and the 2 s poll goes |
| 6 | **Work out nutrition**, **Make a photo** and **Check prices now**: wait, or always hand over? | **Decided November 22, 2026: wait, then hand over,** as one link does (decision 1). The request waits up to 10 s and answers as before if it's done; otherwise the recipe page says "Working out nutrition…" or "Making a photo…", after a reload too, and whoever started it gets a notice when it's done or didn't work. A second press joins the job already going |
| 7 | A receipt read in the background that turns out to be a recipe | **Decided November 22, 2026: the scan page holds on.** It keeps showing Reading…, with the files in memory, until the receipt is ready, so **Add it as a recipe** works as now while you're there. Left, it's under Waiting receipts as "Reading…", with a notice when it's ready; one that was a recipe or no receipt says so there, with **Discard** |
| 8 | The share sheet's and the assistant's receipts | **Decided November 22, 2026: they stay in the request** for slice 4. The share sheet must know receipt or recipe before it answers, the assistant reads inside its streamed reply, and each AI call gives up after 90 s (slice 2). Moving the share sheet to a job is for later |
| 9 | Emptying Recently deleted | **Decided November 22, 2026: the recipes go at once and a job removes their photos.** The same for **Delete for good**, deleting picked ones and the daily purge |

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
