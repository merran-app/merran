# Discover as it finds them Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slice 5 of the speed work. A Discover search shows matches from the shelf at once, then each recipe from the web as soon as its page opens, with progress, **Stop** and **Find more**, and its photos kept small on the server like the shelf's.

**Architecture:** A search becomes rounds. Starting one (a new search, **Find more**, or a collection's Find more) adds up to 4 matches from the shelf in the request, by plain word matching with no AI, then queues a job. The job asks the AI for picks as now, then opens them through a pool of four, saving each recipe as soon as it opens with its small photo, and stops opening once the round has 8. The runner's progress, never dropped now, tells the web app over the live stream, so the cards arrive as they're found.

**Tech Stack:** Hono with @hono/zod-openapi, MikroORM 7 (SQLite and Postgres), sharp, the AI SDK, React 19 with TanStack Query 5, vitest (server), node:test (web).

**Branch:** `perf/discover`, from main after slice 4 (#109).

**Spec:** [docs/performance.md](../../performance.md): slice 5's row in The plan, [Discover and the shelf](../../performance.md#discover-and-the-shelf), and decision 5.

## Decided before planning (November 25, 2026)

1. **Up to 4 matches from the shelf lead each round, on top of the web's 8.** A search can show 12 at once. The web search is what Discover is for, so it keeps its full 8.

## Decided while planning (November 25, 2026)

For the user to confirm with the plan:

2. **Find more adds a round to the same search,** on Discover and on a collection: up to 4 more from the shelf and up to 8 more from the web, with every dish already in the search named to the AI as one to avoid. A collection's button always says **Find more**, and adds to its last search.
3. **Stop keeps what the search found.** The search says it was stopped (a new status, `stopped`), with **Find more** to carry on.
4. **A round stops opening pages once it has 8.** The AI's other picks aren't opened.
5. **A round cut off by a restart carries on** from the picks the AI gave, which are kept with the job as it goes. It opens only the ones it hadn't tried, and the AI isn't asked, or paid, again.
6. **Shelf matches are found by words, from the whole shelf,** as starter collections read it: every meaningful word of the theme ("soups" in "Cozy fall soups") must be in a recipe's name, keywords, course or diets. Moods, seasons and filler ("cozy", "fall", "quick", "something") aren't matched, and a theme made only of them matches nothing from the shelf. Only English words are known to be filler, so other languages match more strictly.
7. **Discover still needs AI.** Shelf matches are the first part of an AI search, not a search of their own. Searching the shelf is for the search revamp.
8. **A search's photos are fetched as it saves each recipe,** made small like the shelf's (640×480 WebP), and removed with the search once it's past the household's last 12. A recipe from the shelf uses the shelf's photo. Older searches keep the sites' photo links they have.
9. **The job no longer announces a change to every recipe query when it ends.** Its live `job` events already refresh the searches.

## Global Constraints

- Each round: up to **4** from the shelf (`FROM_SHELF`), then up to **8** from the web (`MOST`), no more than **2** from a site (`PER_SITE`) unless there aren't others. Pages open **4** at a time (`AT_ONCE`). Fewer than **4** (`ENOUGH`) that open, and the AI is asked once more. At most **30** dishes are named to avoid (`MOST_AVOIDED`). A household keeps its last **12** searches (`KEPT`).
- A search's photos are kept at `discover/{householdId}/{discoveryId}/{photo}.webp`, where `{photo}` is 24 hex characters, made with the shelf's size: `{ width: 640, height: 480, quality: 72 }`, `fit: "cover"`.
- A shelf match's `why` is its own description, cleaned as the shelf shows it, up to 300 characters, or "" when it has none. Its photo is `/api/sites/recipes/{id}/photo`.
- Searches' statuses are `searching`, `done`, `stopped` and `failed`.
- API changes: `pnpm --filter @merran/server openapi`, then `pnpm --filter @merran/web api` and `pnpm --filter @merran/extension api` (both `schema.d.ts` identical). The `api` scripts fail in Git Bash here: run them in PowerShell with `$env:pnpm_config_cache_dir = "D:\Development\Mise\.local\pnpm-cache"`. A recipe's `photo` changes from the site's link to a path on Merran, and `status` gains `stopped`: the pull request's title is `feat!:`.
- Entity changes: `pnpm --filter @merran/server db:migration <name>` writes one for SQLite and one for Postgres. Docker won't start on this machine, so write the Postgres one offline from the snapshot with `apps/server/.local/gen-pg-migration.ts`. The SQLite generator drops enum checks when it rebuilds a table: check the SQLite migration keeps `check (status in ('searching', 'done', 'stopped', 'failed'))`, and write it by hand if not. Nothing references `discoveries`, so rebuilding it deletes nothing else; still, run the migration on a copy of a dev database and check the searches survive.
- Routes mirror the API (`POST /api/discover/{discoveryId}/stop` is `apps/server/src/http/routes/discover/[discoveryId]/stop/post.ts`). Words people read go in `apps/web/src/locales/en.json`; a string whose meaning changes gets a new key.
- Comments are plain English and say why. Code is written for people to read: no packed one-liners. Logical classes only (`ms-*`, `text-start`); drawers, not dialogs, on mobile.
- Prettier from the root only (`pnpm format`), never on `docs/`.
- Focused tests: `pnpm --filter @merran/server exec vitest run --project sqlite <path>`; Postgres with `--project postgres --maxWorkers=2` on a busy machine. Web: `pnpm --filter @merran/web test`.

## Review Focus

1. **Two pages of the same dish opening at once.** Both finish while the other's photo is still being fetched, so both pass a check made at save time. A recipe is checked and counted the moment its page opens, before its photo is fetched. Pinned in Task 4.
2. **Stop while pages are opening.** The search must end `stopped` with what it found, not stay "searching" for good, whether the job was running or still waiting. Pinned in Tasks 4 and 5.
3. **A restart in the middle of a round.** No second AI call; the untried picks are opened and the recipes already saved stay. Pinned in Task 4.
4. **A shelf recipe the household can't eat, or has already.** It must not show, however well it fits the theme. Pinned in Task 3.
5. **A theme of only moods and filler** ("something cozy"). No shelf matches, rather than every recipe on the shelf. Pinned in Task 3.

Also pinned: a held-back progress saved after its job ended mustn't overwrite the job's result (Task 1), and a search's photo route serves only its own household's photos (Task 2).

---

### Task 1: Progress is held back, never dropped

The runner saves a job's progress at most twice a second and drops a call that comes sooner. A Discover card saved just after the one before wouldn't be told to the web app until the next page opened, up to 15 seconds later. Hold the latest call back and save it once the half second is up.

**Files:**
- Modify: `apps/server/src/services/jobs/runner.ts` (`#run`: `ctx.progress`, and where the try settles)
- Test: `apps/server/src/services/jobs/runner.test.ts`

**Interfaces:**
- Produces: `JobContext["progress"]` keeps its signature. A call within `PROGRESS_EVERY_MS` (500) of the last save is no longer dropped: the latest one is saved, and its `job` event sent, once the 500 ms is up. A call with `done === total` is still saved at once.

- [ ] **Step 1: Write the failing tests**

```ts
test("saves progress that came too soon, once the half second is up", async () => {
  // Two moves a moment apart: the second must still be told.
  let finish!: () => void
  const finished = new Promise<void>((resolve) => (finish = resolve))
  const jobs = runner([
    {
      kind: "long",
      area: "recipes",
      run: async ({ progress }) => {
        await progress(1, 3, { at: 1 })
        await progress(2, 3, { at: 2 })
        await finished
        return { at: "end" }
      },
    },
  ])
  const job = await enqueue(em(), { kind: "long", householdId: home })
  await jobs.start()
  await expect
    .poll(async () => (await load(job.id)).progress, { timeout: 2000 })
    .toEqual({ done: 2, total: 3 })
  expect((await load(job.id)).result).toEqual({ at: 2 })
  finish()
  await expect.poll(async () => (await load(job.id)).status).toBe("done")
})

test("doesn't save progress it held back once the job has ended", async () => {
  const jobs = runner([
    {
      kind: "long",
      run: async ({ progress }) => {
        await progress(1, 3, { at: 1 })
        await progress(2, 3, { at: 2 })
        return { at: "end" }
      },
    },
  ])
  const job = await enqueue(em(), { kind: "long" })
  await jobs.start()
  await expect.poll(async () => (await load(job.id)).status).toBe("done")
  await new Promise((resolve) => setTimeout(resolve, 700))
  expect((await load(job.id)).result).toEqual({ at: "end" })
})
```

Use the file's own helpers (`runner`, `enqueue`, `em`, `load`, its household); if the file names them differently, follow it. Also check that the `job` events the first test heard include `{ done: 2, total: 3 }`, as the existing events test does.

- [ ] **Step 2: Run them to make sure the first fails**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/jobs/runner.test.ts`
Expected: the first test fails (progress stays `{ done: 1, total: 3 }`). The second may pass already.

- [ ] **Step 3: Hold back the latest call in `ctx.progress`**

A call that comes too soon keeps `{ done, total, soFar }` as the pending one and, if no timer is set, sets one for what's left of the 500 ms. The timer saves the pending call as a call on time would, sending its event. A call on time, or with `done === total`, clears the pending one and its timer. As soon as `handler.run` settles, before the try's end is saved, clear the timer, so a held-back save can't land after the result.

- [ ] **Step 4: Run the runner's tests**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/jobs/`
Expected: PASS, the existing progress and events tests included.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/jobs/runner.ts apps/server/src/services/jobs/runner.test.ts
git commit -m "Save a job's progress that came too soon, once the half second is up"
```

---

### Task 2: A search that can be stopped, with progress and small photos

**Files:**
- Modify: `apps/server/src/database/entities/discoveries.ts`; migration `discovery_rounds` (SQLite and Postgres)
- Modify: `apps/server/src/services/recipes/discover/sites/shelf.ts` (move the fetch and resize out of `keepShelfPhoto`)
- Create: `apps/server/src/services/recipes/discover/photos.ts`
- Modify: `apps/server/src/services/recipes/discover/discover.ts` (`describeDiscovery`, and removing older searches)
- Modify: `apps/server/src/http/schemas/discover.ts`
- Create: `apps/server/src/http/routes/discover/[discoveryId]/photos/index.ts`, `.../photos/[photo]/index.ts`, `.../photos/[photo]/get.ts` (and register `photos` in `[discoveryId]/index.ts`)
- Regenerate: `apps/server/openapi.json`, both `schema.d.ts`
- Test: `apps/server/src/services/recipes/discover/photos.test.ts`, `apps/server/src/http/routes/discover/discover.test.ts` (new)

**Interfaces:**
- Produces:
  - `DISCOVERY_STATUSES = ["searching", "done", "stopped", "failed"] as const`
  - `Discovery.progress: { done: number; total: number } | null` (`p.json<…>().nullable()`): pages opened of those the AI offered, while it opens them; null otherwise.
  - `Discovery.jobId: string | null` (`p.string().nullable()`): the job of the round going now, for Stop. Not in the API.
  - `DiscoveredRecipe` gains `photoKey?: string | null` (the file kept for it, the `{photo}` in its path) and `shelfId?: string | null` (the shelf recipe it is). `photo` is now what the API shows: `/api/discover/{discoveryId}/photos/{photoKey}`, a shelf recipe's photo path, or, for a search from before this change, the site's own link.
  - In `shelf.ts`: `export async function smallPhoto(fetcher: Fetcher, url: string, referer: string): Promise<Buffer>`, the fetch and resize `keepShelfPhoto` did, throwing when it won't load. `keepShelfPhoto` calls it.
  - In `photos.ts`:
    - `export const foundPhotoPath = (householdId: string, discoveryId: string, photoKey: string) => string` (`discover/{householdId}/{discoveryId}/{photoKey}.webp`)
    - `export const searchFolder = (householdId: string, discoveryId: string) => string` (`discover/{householdId}/{discoveryId}`)
    - `export async function keepFoundPhoto(deps: Pick<AppDeps, "fetcher" | "files">, place: { householdId: string; discoveryId: string }, photoUrl: string | null, pageUrl: string): Promise<{ photo: string; photoKey: string } | null>`: fetches it small and keeps it, answering its API path and key; null when there's no photo or it won't load. A stopped job's stop is rethrown (`throwIfStopped()`), not taken as a photo that won't load.
  - `describeDiscovery` answers `{ id, theme, collection, status, error, progress, recipes: { url, name, site, minutes, photo, why }[], createdAt, updatedAt }`: `photoKey` and `shelfId` stay inside.
  - `GET /discover/{discoveryId}/photos/{photo}` (`operationId: "getDiscoveryPhoto"`, `openToKeys("recipes", "read")`): `image/webp` with `Cache-Control: private, max-age=604800`, as the shelf's photo route does; 404 `no_photo` when the search has no recipe with that `photoKey` or the file's gone, and 404 `discovery_not_found` for another household's search.

- [ ] **Step 1: Write the failing tests**

In `photos.test.ts`, with a `LocalFileStore` in a temp folder and a fetcher that answers a small JPEG made with sharp (as `sites.test.ts` does):

```ts
test("keeps a found recipe's photo small, as WebP", async () => {
  const kept = await keepFoundPhoto(deps, { householdId: HOME, discoveryId: SEARCH }, "https://cooking.example/soup.jpg", "https://cooking.example/soup")
  expect(kept?.photoKey).toMatch(/^[0-9a-f]{24}$/)
  expect(kept?.photo).toBe(`/api/discover/${SEARCH}/photos/${kept?.photoKey}`)
  const file = await files.read(foundPhotoPath(HOME, SEARCH, kept!.photoKey))
  const meta = await sharp(file!).metadata()
  expect([meta.format, meta.width, meta.height]).toEqual(["webp", 640, 480])
})

test("answers null for no photo, or one that won't load", async () => {
  expect(await keepFoundPhoto(deps, place, null, PAGE)).toBeNull()
  expect(await keepFoundPhoto(deps, place, "https://cooking.example/missing.jpg", PAGE)).toBeNull()
})
```

In `routes/discover/discover.test.ts` (with `createTestApp`; save a `Discovery` directly, with one recipe whose `photoKey` has a file at its path):

```ts
test("serves a search's photo to its household, and no one else", async () => {
  const mine = await kyle.get(`/api/discover/${search.id}/photos/${KEY}`)
  expect(mine.status).toBe(200)
  expect(mine.headers.get("content-type")).toBe("image/webp")
  expect((await kyle.get(`/api/discover/${search.id}/photos/${"0".repeat(24)}`)).status).toBe(404)
  expect((await someoneElse.get(`/api/discover/${search.id}/photos/${KEY}`)).status).toBe(404)
})

test("describes a search's recipes without what it keeps inside", async () => {
  const body = await (await kyle.get(`/api/discover/${search.id}`)).json()
  expect(body.recipes[0]).toEqual({ url, name, site, minutes: 40, photo: `/api/discover/${search.id}/photos/${KEY}`, why })
  expect(body.progress).toBeNull()
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/recipes/discover/photos.test.ts src/http/routes/discover/`
Expected: FAIL (`photos.ts` and the route don't exist).

- [ ] **Step 3: Change the entity and write the migration**

The three entity changes above, then `pnpm --filter @merran/server db:migration discovery_rounds`, with the SQLite check and the Postgres migration as Global Constraints say.

- [ ] **Step 4: Write `smallPhoto`, `photos.ts`, the photo route and the schema**

Schema: `status`'s description says what `stopped` is; `progress` is `{ done, total }` or null, "Pages opened of those found online, while they open."; `recipes[].photo` is "A small copy kept by Merran, or null."; `recipes`' description says up to 4 from the shelf of recipes Merran reads, then up to 8 from the web, for each round. Add the example's `progress: null`.

- [ ] **Step 5: Remove older searches' photos with them**

Where `startDiscovery` removes searches past the last 12, queue their folders' removal in the same flush with `removeFilesLater(em, householdId, older.map((search) => searchFolder(householdId, search.id)))`, then `wakeRunner()`. Add a test to `routes/discover/discover.test.ts` or the service test that a 13th search queues a `files.remove` job for the oldest's folder.

- [ ] **Step 6: Regenerate the API and run the tests**

Run: `pnpm --filter @merran/server openapi`, then the two `api` scripts in PowerShell; then `pnpm --filter @merran/server exec vitest run --project sqlite src/services/recipes/discover/ src/http/routes/discover/ src/http/routes/sites/` and `pnpm typecheck`.
Expected: PASS, and both `schema.d.ts` identical.

- [ ] **Step 7: Commit**

```bash
git add apps/server apps/web/src/lib/api/schema.d.ts apps/extension
git commit -m "Keep Discover's photos small on Merran, and give searches progress and a stopped status"
```

---

### Task 3: Matches from the shelf, at once and without AI

**Files:**
- Create: `apps/server/src/services/recipes/discover/dishes.ts` (move `FILLER`, `dishWords` and `sameDish` here from `discover.ts`)
- Create: `apps/server/src/services/recipes/discover/shelf-matches.ts`, `shelf-matches.test.ts`
- Modify: `apps/server/src/services/recipes/discover/discover.ts` (`startDiscovery` adds them), `discover.test.ts` (imports `sameDish` from `dishes.ts`)

**Interfaces:**
- Consumes: `wordPattern` and `coursesOf` (`sites/shelf.ts`), `suits` and `describeShelfRecipe` (`sites/sites.ts`, for the cleaned description), `libraryByUrl` (`sites/sites.ts`), `getTastes`, `DIETS` (`@merran/shared`), `SiteRecipe`.
- Produces:
  - `dishes.ts`: `export function sameDish(a: string, b: string): boolean`, unchanged.
  - `export function themeWords(theme: string): string[]`: the theme's words that can be matched, lowercase, filler left out. A hyphenated word stays whole when it's a diet label ("gluten-free"), and is split otherwise ("sheet-pan").
  - `export function fitsTheme(words: readonly string[], recipe: Pick<SiteRecipe, "name" | "keywords" | "courses" | "diets">): boolean`: every word is a diet label the recipe has, names a course it's in (`coursesOf([word])`), or is a whole word in its name or keywords (`wordPattern`), as written or without a final "s" or "es". False for no words.
  - `export const FROM_SHELF = 4`
  - `export async function shelfMatches(em: EntityManager, householdId: string, theme: string, options: { avoid: readonly string[]; skip: readonly string[] }): Promise<DiscoveredRecipe[]>`: up to 4 recipes on the shelf (`state: "recipe"`, every site and classic) that fit the theme, suit the household, aren't in its library, aren't at a link in `skip`, and aren't the same dish as one in `avoid` or as each other; newest first (`publishedAt`, then `createdAt`). Each with `shelfId`, `photoKey: null`, and `photo` and `why` as Global Constraints say. No words: `[]`, without reading the shelf.

The filler words (English), to leave out of `themeWords`: articles and small words (a, an, and, or, the, with, for, of, in, on, to, my, our, your, some, something, anything, new, more, other, like), moods (cozy, cosy, comforting, comfort, hearty, cheap, budget, easy, quick, simple, fast, lazy, weeknight, weekend, everyday, family, healthy, light, fresh, delicious, tasty, best, favorite, favourite, classic, perfect), seasons and times (fall, autumn, winter, spring, summer, seasonal, holiday, tonight, today), and words for recipes themselves (recipe, recipes, idea, ideas, dish, dishes, food, foods, meal, meals). "Dinner", "mains" and the other course words stay: they match a course.

- [ ] **Step 1: Write the failing tests**

```ts
describe("a theme's words", () => {
  test("leaves out moods, seasons and filler", () => {
    expect(themeWords("Cozy fall soups")).toEqual(["soups"])
    expect(themeWords("Quick weeknight pasta")).toEqual(["pasta"])
    expect(themeWords("Sheet-pan dinners")).toEqual(["sheet", "pan", "dinners"])
    expect(themeWords("Something new with chicken")).toEqual(["chicken"])
    expect(themeWords("Hearty vegetarian mains")).toEqual(["vegetarian", "mains"])
    expect(themeWords("Gluten-free cookies")).toEqual(["gluten-free", "cookies"])
    expect(themeWords("something cozy")).toEqual([])
  })

  test("fit a recipe by its name, keywords, course or diets", () => {
    const soup = { name: "Lentil Soup", keywords: ["lentils"], courses: ["soup"], diets: ["vegan", "vegetarian"] }
    expect(fitsTheme(["soups"], soup)).toBe(true)
    expect(fitsTheme(["vegetarian", "soups"], soup)).toBe(true)
    expect(fitsTheme(["chicken"], soup)).toBe(false)
    expect(fitsTheme(["sauces"], { ...soup, name: "Green Sauce", courses: [] })).toBe(true)
    expect(fitsTheme(["tomatoes"], { ...soup, name: "Tomato Tart", courses: [] })).toBe(true)
    expect(fitsTheme(["dinners"], { ...soup, name: "Gnocchi", courses: ["main"] })).toBe(true)
    expect(fitsTheme([], soup)).toBe(false)
  })
})

describe("shelf matches", () => {
  test("finds up to four that suit the household, newest first", async () => {
    // Shelf: five soups, newest to oldest, one with peanuts, one in the
    // library already, and one a take on another's dish; and a stew.
    const found = await shelfMatches(em(), home, "Cozy fall soups", { avoid: [], skip: [] })
    expect(found.map((recipe) => recipe.name)).toEqual([...])
    expect(found[0]).toMatchObject({ shelfId: expect.any(String), photoKey: null, why: "A bright, lemony soup." })
  })

  test("leaves out what the household can't eat or has already", async () => { ... })
  test("leaves out links in the search, and dishes it's told to avoid", async () => { ... })
  test("finds nothing for a theme of only moods", async () => {
    expect(await shelfMatches(em(), home, "something cozy", { avoid: [], skip: [] })).toEqual([])
  })
})
```

Set the shelf up in the test with `SiteRecipe` rows (`state: "recipe"`, `courses`, `keywords`, `ingredients`, `diets`, `publishedAt`), a household that avoids peanuts (its tastes, as `getTastes` reads them), and a `Recipe` with one shelf row's `sourceUrl`. Fill in the expected names from the rows you make.

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/recipes/discover/`
Expected: FAIL (`shelf-matches.ts` doesn't exist).

- [ ] **Step 3: Move `sameDish`, and write `themeWords`, `fitsTheme` and `shelfMatches`**

Match the words first, in memory, then look up the library and tastes for the few that fit, not the whole shelf.

- [ ] **Step 4: Start a search with its shelf matches**

`startDiscovery` creates the search with `recipes: await shelfMatches(em, householdId, theme, { avoid, skip: [] })`, so `POST /discover` answers with them. It still refuses first when a search is going or AI isn't there.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/recipes/discover/ src/http/routes/discover/ src/http/routes/sites/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/recipes/discover
git commit -m "Lead a Discover search with matches from the shelf, found without AI"
```

---

### Task 4: Each recipe saved as its page opens

**Files:**
- Modify: `apps/server/src/services/recipes/discover/discover.ts` (the job, `open`, `keep`'s rule as it goes)
- Create: `apps/server/src/services/recipes/discover/rounds.ts`, `rounds.test.ts`

**Interfaces:**
- Consumes: `keepFoundPhoto` (Task 2), `sameDish` (Task 3), `JobContext["progress"]` (Task 1), `findBySourceUrl`, `readRecipeData`, `normalizeLink`, `isVideoLink`.
- Produces, in `rounds.ts`:
  - `export type AiPick = { url: string; name: string; why: string }`
  - `export type RoundSaved = { startedWith: number; picks: AiPick[]; tried: string[]; failed: string[]; asked: number }`: what a round keeps with its job as it goes, so a restart carries on. `startedWith` is how many recipes the search had when the job began; `tried` the picks opened or given up on; `failed` the picks that didn't open as recipes, to tell the AI; `asked` how many times the AI's been asked (1 or 2).
  - `export async function runRound(deps: Pick<AppDeps, "fetcher" | "files">, em: EntityManager, discovery: Discovery, options: { householdId: string; avoid: readonly string[]; ask: (failed: string[]) => Promise<AiPick[]>; saved: RoundSaved | null; progress: JobContext["progress"]; signal: AbortSignal }): Promise<void>`: runs one round on a search that's `searching`, saving each recipe as it opens, and leaves the search `done`, `stopped` or `failed`. A stop for a restart is rethrown with the search left searching.
- The handler (`discoverJob`) parses its payload, finds the search, returns at once if it isn't `searching` (stopped before it started), and calls `runRound` with `ask` wired to `askForPicks`, `saved` from `ctx.saved`, and the context's `progress` and `signal`. It no longer calls `deps.events.changed`. Its `cancelledWaiting` marks a search still `searching` as `stopped`, with `progress` null.

How a round goes:

1. The picks are `saved.picks`, or the AI's (`ask([])`). Every pick not in `saved.tried` is opened, four at a time: when one finishes, the next starts, rather than each four waiting for the slowest. No new one starts once the round has 8 or the job's stopped.
2. Opening a pick reads its page (not a video, not in the library, with recipe data), and fetches no photo yet. One that doesn't open goes in `failed`.
3. A recipe that opens is checked at once, before anything is awaited: dropped if the search has it already (same link, or the same dish by `sameDish`) or it's the same dish as one in `avoid`; held back if its site has 2 of this round's already; otherwise it's this round's, counted from then. Then its photo is fetched (`keepFoundPhoto`) and it's saved to the search. Saves go one after another, since one entity manager can't flush twice at once.
4. After each pick, `progress(tried, picks.length, saved)`, and the search's own `progress` set to the same `{ done, total }` and saved, in turn with the other saves.
5. With every pick tried, if the AI's been asked once, fewer than 4 opened this round (kept and held back), and the round isn't full, the AI's asked once more with `failed`, and its picks are opened the same way, `total` growing with them.
6. Then the held-back ones fill the round up to 8, in the order they opened, each with its photo.
7. The search is `done`, with `progress` null and `error`: "Nothing turned up that Merran could open. Try another theme." when it has no recipes at all; "Nothing else turned up online that Merran could open." when it has some but this round found none online; otherwise null.
8. Stopped by someone (`JobStopped` with `why: "cancelled"`): the search is `stopped`, `progress` null, what it found kept, and the stop rethrown. Stopped for a restart (`why: "shutdown"`): rethrown, the search left as it is. Any other error: `failed`, with an `AppError`'s message or "The search didn't work. Try again in a moment.", the recipes found kept, and a warning logged for an unexpected one, as now.

Tell a stop apart as `receipts.ts` does (`shuttingDown`, `wasCancelled`). `open`'s own catch swallows a stopped fetch, so look at the signal after the pool, and `throwIfStopped()`.

- [ ] **Step 1: Write the failing tests**

In `rounds.test.ts`, with a test database (`createTestDatabase`, `forHousehold`), a `LocalFileStore` in a temp folder, a fetcher over a map of pages (recipe pages with JSON-LD and an `image`, as `sites.test.ts` makes them) and photos, `progress` and `ask` recorded in arrays, and a search saved as `searching`:

```ts
test("saves each recipe as its page opens, with its photo", async () => {
  // Six picks from six sites; the third page's photo waits on a promise the
  // test resolves last.
  const round = runRound(deps, em(), search, options)
  await expect.poll(() => savedNames()).toContain("Lentil Soup")
  release()
  await round
  expect(search.status).toBe("done")
  expect(search.recipes).toHaveLength(6)
  expect(search.recipes.every((recipe) => recipe.photo?.startsWith(`/api/discover/${search.id}/photos/`))).toBe(true)
})

test("opens four at a time, starting the next as each finishes", async () => {
  // Track pages being fetched at once: never over 4, and a fifth starts
  // while one of the first four is still waiting.
})

test("keeps one of two pages of the same dish that open at once", async () => {
  // Two picks, "Easy Lentil Soup" and "Lentil Soup", whose photos both wait
  // until both pages have opened.
  expect(search.recipes.map((recipe) => recipe.name)).toEqual(["Easy Lentil Soup"])
})

test("stops opening once the round has eight", async () => {
  // Twelve picks from twelve sites: eight saved, and fewer than twelve pages fetched.
})

test("takes no more than two from a site, unless there aren't others", async () => {
  // Five picks from a.example, then two from b.example: two from a, then
  // the two from b, then a's other three, held back until the end, fill
  // the round. All seven are kept, in that order.
})

test("asks the AI once more, saying which didn't open, when fewer than four open", async () => {
  expect(asked).toEqual([[], ["https://broken.example/one", ...]])
})

test("carries on after a restart from the picks it was given", async () => {
  // saved: three picks, the first tried; ask throws if it's called.
  expect(fetchedPages()).toEqual([second, third])
})

test("ends stopped, with what it found, when it's stopped", async () => {
  // Abort with new JobStopped("cancelled") once the first recipe is saved.
  await expect(round).rejects.toBeInstanceOf(JobStopped)
  expect(search.status).toBe("stopped")
  expect(search.recipes).toHaveLength(1)
})

test("stays searching when stopped for a restart", async () => {
  // Abort with new JobStopped("shutdown").
  expect(search.status).toBe("searching")
})

test("says nothing else turned up when a round finds nothing online", async () => {
  // A search with a shelf match, and picks that don't open.
  expect(search.error).toBe("Nothing else turned up online that Merran could open.")
})
```

Fill each test's setup in; the comments say what each sets up. Use `progress` records to check the last call carried `{ done: total, total }` and a `RoundSaved` with every pick tried.

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/recipes/discover/rounds.test.ts`
Expected: FAIL (`rounds.ts` doesn't exist).

- [ ] **Step 3: Write `runRound`, and change the handler to use it**

`keep` and its test go: the rule is applied as the round goes. Keep the AI's prompt and `askForPicks` as they are.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/recipes/discover/ src/http/routes/discover/ src/services/jobs/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/recipes/discover
git commit -m "Save each Discover recipe as its page opens, four pages at a time, with Stop"
```

---

### Task 5: Find more and Stop

**Files:**
- Modify: `apps/server/src/services/recipes/discover/discover.ts` (a round started for a new or existing search; `findMore`; `stopDiscovery`)
- Create: `apps/server/src/http/routes/discover/[discoveryId]/more/index.ts`, `.../more/post.ts`, `.../stop/index.ts`, `.../stop/post.ts` (registered in `[discoveryId]/index.ts`)
- Modify: `apps/server/src/http/routes/collections/[collection]/find/post.ts`, `apps/server/src/http/routes/discover/post.ts` (description)
- Regenerate: `apps/server/openapi.json`, both `schema.d.ts`
- Test: `apps/server/src/http/routes/discover/discover.test.ts`

**Interfaces:**
- Consumes: `shelfMatches` (Task 3), `discoverJob` (Task 4), `Discovery.jobId` (Task 2).
- Produces:
  - `startDiscovery(deps, em, options)` keeps its signature. It and `findMore` share one function that starts a round: refuses with `discover_busy` (409, "A search is going already. It'll be done in a minute.") when any search is going, and `aiUnavailable` when AI isn't there; adds the round's shelf matches (`skip` the links in the search, `avoid` its names and the ones given); sets the search `searching` with `progress` and `error` null; queues the job with its payload `{ discoveryId, userId, avoid }` and saves its id as `jobId`. `avoid` is the names already in the search, newest first, then the ones given (a collection's), at most 30.
  - `export async function findMore(deps: AiDeps, em: EntityManager, options: { householdId: string; userId: string; discoveryId: string; avoid?: readonly string[] }): Promise<DiscoveryView>`
  - `export async function stopDiscovery(jobs: JobRunner, em: EntityManager, householdId: string, discoveryId: string): Promise<DiscoveryView>`: refuses with `discover_finished` (409, "That search has already finished.") when it isn't searching; stops its job (`jobs.cancel` on `jobId`, found with `findJob`); and marks it `stopped`, `progress` null, at once, so the answer says so. The job, ending, leaves it stopped.
  - `POST /discover/{discoveryId}/more` (`operationId: "findMoreDiscoveries"`, `openToKeys("recipes", "write")`): 202 with the search, now searching again and with its new shelf matches; 404, 409.
  - `POST /discover/{discoveryId}/stop` (`operationId: "stopDiscovery"`, `openToKeys("recipes", "write")`): 200 with the search, stopped; 404, 409.
  - `POST /collections/{collection}/find` adds a round to the collection's last search when there is one, and starts one otherwise; its `avoid` is the collection's recipes' names, as now.

- [ ] **Step 1: Write the failing tests**

In `routes/discover/discover.test.ts`, with the household's AI set up for Discover with a model that can search the web as the AI tests do (`mockAiModels`, a household key), and the job runner not started, so rounds stay queued:

```ts
test("Find more adds a round to the same search", async () => {
  // A done search with one recipe, and a shelf recipe that fits its theme.
  const more = await kyle.post(`/api/discover/${search.id}/more`)
  expect(more.status).toBe(202)
  const body = await more.json()
  expect(body.id).toBe(search.id)
  expect(body.status).toBe("searching")
  expect(body.recipes.map((recipe) => recipe.name)).toEqual(["Lentil Soup", "Tomato Soup"])
  const job = await jobFor(search.id)
  expect(job.payload.avoid).toEqual(["Tomato Soup", "Lentil Soup"])
})

test("Find more waits for a search that's going", async () => {
  expect((await kyle.post(`/api/discover/${search.id}/more`)).status).toBe(409)
})

test("Stop ends a search, keeping what it found", async () => {
  const stopped = await kyle.post(`/api/discover/${searching.id}/stop`)
  expect(stopped.status).toBe(200)
  expect(await stopped.json()).toMatchObject({ status: "stopped", progress: null })
  expect((await jobFor(searching.id)).status).toBe("cancelled")
  expect((await kyle.post(`/api/discover/${searching.id}/stop`)).status).toBe(409)
})

test("a collection's Find more adds to its last search", async () => { ... })
```

If setting up AI for the route tests is more than the AI tests' helpers give, test `findMore` and `stopDiscovery` at the service level instead, with `resolveTask` answering ready, and keep one route test each for the 404 and the 409.

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/discover/`
Expected: FAIL (the routes don't exist).

- [ ] **Step 3: Write the shared round start, `findMore`, `stopDiscovery`, the routes, and the collection's change**

Descriptions: `POST /discover` says it answers at once with matches from the shelf of recipes Merran reads, and the search carries on in the background, saving each recipe from the web as its page opens; follow it at `GET /discover/{discoveryId}` or by the live `job` event; stop it at `POST /discover/{discoveryId}/stop`; add more at `POST /discover/{discoveryId}/more`. The collection's says it adds to the collection's last search.

- [ ] **Step 4: Regenerate the API and run the tests**

Run: `pnpm --filter @merran/server openapi`, the two `api` scripts in PowerShell, then `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/discover/ src/http/routes/sites/ src/services/recipes/discover/` and `pnpm typecheck`.
Expected: PASS, and both `schema.d.ts` identical.

- [ ] **Step 5: Commit**

```bash
git add apps/server apps/web/src/lib/api/schema.d.ts apps/extension
git commit -m "Add Find more and Stop to Discover searches"
```

---

### Task 6: The web app shows them as they come

**Files:**
- Modify: `apps/web/src/features/find/discover-tab.tsx` (`Search`, `DiscoverTab`)
- Create: `apps/web/src/features/find/placeholders.ts`, `placeholders.test.ts`
- Modify: `apps/web/src/routes/_app/recipes/find/$collection.tsx`
- Modify: `apps/web/src/locales/en.json`

**Interfaces:**
- Consumes: `POST /api/discover/{discoveryId}/more`, `POST /api/discover/{discoveryId}/stop`, `Discovery.progress`, `status: "stopped"` (Tasks 2 and 5).
- Produces:
  - `export function placeholders(search: { status: string; recipes: readonly unknown[] }): number`: how many skeleton cards follow the found ones, enough for 4 tiles while searching (`Math.max(0, 4 - recipes.length)`), none otherwise.
  - `Search({ search, hideTheme, onMore, moreBusy })`: `onMore?: () => void` shows **Find more** under the cards once the search isn't searching; `moreBusy?: boolean` disables it.

What `Search` shows:
- Searching: a line with a spinner, **Stop** beside it, saying `discover.searching` until there's `progress`, then `discover.opening`; the cards found so far; then `placeholders(search)` skeletons.
- Stopped: `discover.stopped`, or `discover.stoppedEmpty` with no recipes; then the cards.
- Done or failed: `error`, if any, then the cards, as now.
- **Stop** posts to the stop route and fetches `["recipes", "discover"]` again; an `ApiError` goes to a toast, as Import's do.

The Discover tab passes `onMore`, posting to the more route and fetching the searches again; disabled while any search is going. The collection page keeps its own button in the section's header, which always says `find.collections.findMore`.

New strings in `en.json` (`find.collections.findAgain` goes):
- `discover.opening`: "Opening the recipes it found: {{done}} of {{total}}"
- `discover.stop`: "Stop"
- `discover.stopped`: "Stopped. Here's what it found."
- `discover.stoppedEmpty`: "Stopped before anything turned up."
- `discover.findMore`: "Find more"

- [ ] **Step 1: Write the failing test**

```ts
test("fills a row of four while searching, and no more once it's done", () => {
  assert.equal(placeholders({ status: "searching", recipes: [] }), 4)
  assert.equal(placeholders({ status: "searching", recipes: [1, 2, 3] }), 1)
  assert.equal(placeholders({ status: "searching", recipes: [1, 2, 3, 4, 5] }), 0)
  assert.equal(placeholders({ status: "done", recipes: [] }), 0)
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @merran/web test`
Expected: FAIL (`placeholders.ts` doesn't exist).

- [ ] **Step 3: Write `placeholders`, change `Search`, the tab and the collection page, and the strings**

- [ ] **Step 4: Run the checks**

Run: `pnpm --filter @merran/web test`, `pnpm --filter @merran/web check:locales`, `pnpm typecheck`, `pnpm format:check`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "Show Discover's recipes as they're found, with Stop and Find more"
```

---

### Task 7: The docs say what slice 5 built

**Files:**
- Modify: `docs/performance.md`, `docs/features.md`, `docs/platform.md`
- Modify: `apps/docs/src/content/docs/docs/use/recipes.md`

- [ ] **Step 1: `docs/performance.md`**

The status at the top: slice 5 planned and built on November 25, 2026 ([its plan](superpowers/plans/2026-11-25-discover-as-found.md)), with decision 10; slices 6 to 8 aren't built yet. A **What slice 5 built** section after slice 4's, saying what each task built, with "Decided while building it" for anything decided on the way. Slice 5's row in The plan says it's built, linking there; its "Later" (the AI offering each link as it finds it) stays for later. In [Discover and the shelf](../../performance.md#discover-and-the-shelf), the first three bullets say what slice 5 fixed. Decision 10 in the table: the shelf's matches, decided November 25, 2026, as above; and decisions 2 to 9 of this plan as "Decided while planning", in What slice 5 built.

- [ ] **Step 2: `docs/features.md` and `docs/platform.md`**

The Discover row's notes: shelf matches first, recipes shown as they're found, **Stop** and **Find more**, photos kept small (since November 25, 2026). platform.md: where it says a collection's **Find more** keeps what it finds, that it adds to the collection's last search; and wherever Discover is described, the same.

- [ ] **Step 3: The guide**

There's no guide to Discover yet. In `use/recipes.md`, under "Add a recipe", a short `### Discover new recipes` section: **Recipes → Find recipes → Discover**, a theme, matches from the recipe sites Merran reads straight away, then recipes from the web as Merran opens them, **Stop**, **Find more**, **Import**, and a collection's **Find more**. Quote every label exactly as `en.json` has it.

- [ ] **Step 4: Check the site builds**

Run: `pnpm docs:build`
Expected: builds, every link checked.

- [ ] **Step 5: Commit**

```bash
git add docs apps/docs
git commit -m "Say what slice 5 built: Discover as it finds them, and Find more"
```
