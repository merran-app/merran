# Queries that grow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slice 7 of the speed work. The queries that read more as a household's data grows read only what they need: planning, sales and costs share one loader and work out each line's food once; usual buys read the last year; **Same as…** touches only the rows it changes; the shelf stays in memory; duplicates and tags read less; old rows are cleared daily; and SQLite's settings are applied when its connection opens.

**Architecture:** No API changes. Work that's pure on its input is kept in memory (a line's foods by its text, the shelf until it changes). Reads that grew with history are narrowed (a window, the keys involved, the tags touched, the recipes whose names could match). The daily clean-up gains the tables nothing cleared.

**Tech Stack:** Hono, MikroORM 7.2 on SQLite (better-sqlite3 through Kysely) and Postgres, `@merran/shared` (the ingredient parser and food vocabulary), vitest.

**Branch:** `perf/queries`, stacked on `perf/see-more` (slice 6, #114), in the worktree `.claude/worktrees/queries`. It's rebased onto main once #114 merges.

**Spec:** [docs/performance.md](../../performance.md): slice 7's row in The plan, with its findings under [The database](../../performance.md#the-database) ("Queries that grow with a household" 1–8, the usual buys index, and SQLite's settings), and what slices 5 and 6 left for it (each Discover round and each collection page read the whole shelf).

## Decided while planning (November 27, 2026)

For the user to confirm with the plan:

1. **A line's foods are kept in memory by the line's text,** not stored on `recipe_ingredients` or cached by the recipe's `updatedAt`. `lineFoods` depends only on the text and the built-in vocabulary (no household data), so the text is a complete key: nothing needs clearing when a recipe changes, and no migration. `updatedAt` isn't bumped when only a recipe's lines change, so it couldn't key a cache anyway.
2. **Usual buys read the last 365 days.** A usual buy already needs 3 or more days bought, no more than 120 days apart, so only edge cases at the year's boundary change.
3. **Same as… stays in the request,** touching only the rows with one of the two foods.
4. **The shelf is dropped whenever a shelf row changes,** not only after a site read: opening posts and keeping a photo change it too. It's kept per database, in the one server process Merran runs as ([platform.md](../../platform.md)).
5. **Duplicates are narrowed in memory, not by SQL equality on `source_url`:** links match by `linkKey`, which SQL can't do. All recipes are read without their lines, and lines are read only for the recipes a food check decides.
6. **The daily clean-up keeps:** store prices for 91 days (90 are read, plus a day for time zones); expired sessions, verifications, OAuth tokens and client assertions not at all; rate-limit rows for a day; applied or dismissed suggestions for 30 days, except those from an assistant chat that still exists, whose card asks for them.
7. **SQLite:** `journal_mode = wal`, `busy_timeout = 5000`, `synchronous = normal`, `cache_size = -65536` (64 MiB), `temp_store = memory`, then `optimize = 0x10002` once it's open and `optimize` each night.
8. **Nothing breaks:** no API changes. The pull request's title is `perf:`.

## Global Constraints

- **No raw SQL** beyond SQLite's pragmas, which `orm.ts` already runs that way. Use `em.find` with `fields`, `em.count`/`countBy`, `nativeDelete`. A `nativeDelete` on a household-owned table across households passes `ACROSS_HOUSEHOLDS` or `{ filters: false }` (`database/scope.ts`), as the clean-ups do.
- **Behaviour stays the same** unless a decision above says otherwise: every existing test passes unchanged, except where a task names a test it changes.
- **Migrations:** `pnpm --filter @merran/server db:migration <name>` writes one for SQLite and one for Postgres. Docker won't start on this machine, so make the SQLite one with that command and the Postgres one offline: `node apps/server/.local/gen-pg-migration.ts <name>` (git-ignored, already in this worktree), giving both the same name. A running dev server applies a new migration at once; if one is made again, give it back its first name.
- **Code style:** plain-English comments that say why; code written for people to read, no packed one-liners; match the code around it.
- **Prettier** from the root on named folders (`pnpm exec prettier --write apps/server/src packages/shared/src`) or `pnpm format`, never inside an app and never on `docs/`.
- **Focused tests:** `pnpm --filter @merran/server exec vitest run --project sqlite <path>`; `pnpm --filter @merran/shared test`. Postgres runs in CI.
- **Constants** are module-level and exported where a test needs them, as `KEEP_FINISHED_DAYS` is.

## Review Focus

1. **The shelf kept for the wrong database, or after it changed.** Tests open several databases in one process, and a site read, an opened post or a kept photo changes the shelf. The shelf is kept per database and dropped on any change to a shelf row. Pinned in Task 4.
2. **Same as… leaving a row behind.** A list item, pantry item, purchase, placement or store product whose food was one of the two must end as a full rekey would leave it, and rows with other foods aren't touched. Pinned in Task 3.
3. **The clean-up taking something still in use:** a session not yet expired, a pending suggestion, an applied one shown in a chat that still exists, a price inside 90 days. Pinned in Task 6.
4. **A recipe just imported from the shelf still offered.** Only the shelf is kept; whether a household has a recipe is read each time. Pinned in Task 4.
5. **A kept result changed by a caller.** The line-foods memo and the shelf hand the same objects to every caller; they're frozen, so a caller that changes one fails loudly instead of changing everyone's. Pinned in Tasks 1 and 4.

---

### Task 1: One loader for planning, sales and costs

**Files:**
- Create: `apps/server/src/services/foods/line-foods.ts` (the memo), `apps/server/src/services/plan/library.ts` (the loader), with tests beside them
- Modify: `apps/server/src/services/plan/suggest.ts` (`candidates`, `suggestMeals`), `apps/server/src/services/stores/prices.ts` (`recipeFoods`, `salesForSuggest`), `apps/server/src/services/stores/costs.ts` (`recipeCosts`, `budgetForSuggest`), `apps/server/src/services/plan/autoplan.ts` (`planWeek`), `apps/server/src/http/routes/plan/suggest/post.ts`
- Modify: `packages/shared/src/list/costs.ts` (`recipeCost` takes a `foodsOf` option)

**Interfaces:**
- Produces:
  - `lineFoodsOf(line: string): readonly LineFood[]` in `line-foods.ts`: `lineFoods(line)` from `@merran/shared`, kept by text in a module-level `Map` of up to `LINE_FOODS_KEPT = 20_000` entries (the oldest dropped first). Each result and each food in it is frozen.
  - `loadPlanningLibrary(em: EntityManager): Promise<PlanningLibrary>` in `library.ts`, where `PlanningLibrary = { recipes: readonly PlanningRecipe[] }` and `PlanningRecipe` is a plain object with the recipe fields `suggestMeals`, `checkTastes`, `recipeFoods` and `recipeCosts` read today (`id`, `name`, `servings`, and whatever `suggest.ts` uses: courses, minutes, diets, needs, rating, last made…), `tags: string[]`, and `lines: { rawText: string; mark: IngredientMark | null; foods: readonly LineFood[] }[]` in `position` order. Three queries: recipes (`fields`, no description, notes or steps), their tags, their lines (`fields: ["recipe", "rawText", "mark", "position"]`). Recently deleted recipes are left out, as the default filter does now.
  - `suggestMeals(em, householdId, slots, options)` gains `options.library?: PlanningLibrary`; `recipeFoods(em, library?: PlanningLibrary)`; `recipeCosts(em, householdId, library?: PlanningLibrary)`. Each loads the library itself when it isn't given one.
  - `recipeCost(lines, productOf, { today, isOnHand, foodsOf = lineFoods })` in shared: `foodsOf(line)` gives a line's foods.
  - `salesForSuggest` and `budgetForSuggest` pass a given library through. `POST /plan/suggest` and `planWeek` load the library once and pass it to all three. Their early returns (no Kroger app, no deals, no products) still read no recipes.

- [ ] **Step 1: Write the failing tests**

`line-foods.test.ts`:
```ts
test("a line's foods are worked out once and kept", () => {
  const first = lineFoodsOf("2 cups chopped onion")
  expect(lineFoodsOf("2 cups chopped onion")).toBe(first)
  expect(first).toEqual(lineFoods("2 cups chopped onion"))
})

test("what's kept can't be changed by a caller", () => {
  const foods = lineFoodsOf("salt and pepper")
  expect(Object.isFrozen(foods)).toBe(true)
  expect(foods.every((food) => Object.isFrozen(food))).toBe(true)
})
```

`library.test.ts` (seeding through `kyle.post("/api/recipes", …)` as `stores.test.ts` does):
```ts
test("the planning library has each recipe's tags and lines, in order, with their foods", async () => {
  // a recipe with tags ["quick"] and lines ["1 onion", "2 cups rice"]
  expect(recipe.tags).toEqual(["quick"])
  expect(recipe.lines.map((line) => line.rawText)).toEqual(["1 onion", "2 cups rice"])
  expect(recipe.lines[0]!.foods.map((food) => food.key)).toEqual(lineFoods("1 onion").map((food) => food.key))
})

test("recently deleted recipes aren't in it", async () => {
  // move one to Recently deleted; it's gone from the library
})

test("suggestions come from the library they're given", async () => {
  // suggestMeals with a library holding one made-up recipe not in the
  // database: it's the one suggested, so nothing read the recipes again
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/foods/line-foods.test.ts src/services/plan/library.test.ts`
Expected: FAIL, the modules don't exist.

- [ ] **Step 3: Implement** the memo, the loader, and the three functions reading it. `suggest.ts` keeps `householdKeys` for its own keys; `recipeFoods` and `recipeCosts` keep using the plain keys they use now (they don't apply a household's **Same as…**, which is unchanged here). Everything that called `lineFoods` on a recipe's line in these three goes through `lineFoodsOf`.

- [ ] **Step 4: Run the tests and checks**

Run: the focused tests above, then `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/plan src/http/routes/stores src/http/routes/recipes`, `pnpm --filter @merran/shared test`, `pnpm typecheck`.
Expected: PASS, the existing suggest, autoplan, stores and On sale tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/server packages/shared
git commit -m "Work out each recipe line's foods once, and share one loader for planning, sales and costs"
```

### Task 2: Usual buys from the last year

**Files:**
- Modify: `apps/server/src/services/list/usual.ts` (`allUsualBuys`), `apps/server/src/services/stores/mappings.ts` (`productMappings`)
- Modify: `apps/server/src/database/entities/purchases.ts` (index `(household, boughtOn)`), `apps/server/src/database/entities/shopping_items.ts` (index `(household, foodKey)`, which Task 3 reads by)
- Create: the migration pair `usual_and_list_indexes`
- Test: `apps/server/src/http/routes/list/usual/usual.test.ts`, `apps/server/src/http/routes/stores/stores.test.ts`

**Interfaces:**
- Produces: `USUAL_WINDOW_DAYS = 365` in `usual.ts`. `allUsualBuys` reads purchases with `boughtOn >= addDays(today, -USUAL_WINDOW_DAYS)` (`boughtOn` is a `YYYY-MM-DD` string, so it compares as text), today being `householdToday`. `productMappings` reads purchases in the same window, and only lines of recipes not deleted (`recipe: { deletedAt: null }`).

- [ ] **Step 1: Write the failing tests**

```ts
test("usual buys read the last year", async () => {
  // A food bought every 30 days, but only more than 365 days ago: not a
  // usual buy. The same pattern inside the year still is.
})
```
In `stores.test.ts`, beside the products test: a recently deleted recipe's lines aren't offered for mapping, and a food bought only more than a year ago isn't either.

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/list/usual src/http/routes/stores`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement it, add the two indexes, and make the migrations** (Global Constraints). `src/database/migrations.test.ts` checks they match the entities.

- [ ] **Step 4: Run the tests**

Run: the command above, then `pnpm --filter @merran/server exec vitest run --project sqlite src/database src/http/routes/list`, `pnpm typecheck`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "Read usual buys and store mappings from the last year, with an index for each"
```

### Task 3: Same as… touches only the rows it changes

**Files:**
- Modify: `apps/server/src/services/list/rekey.ts` (add `rekeyFoods`; `rekeyHousehold` stays for the version job), `apps/server/src/services/list/teach.ts` (`sameAs`, `forgetAlias`), and `removeAlias` in `apps/server/src/services/foods/aliases.ts` if it must return the alias's keys
- Test: `apps/server/src/services/list/rekey.test.ts`

**Interfaces:**
- Consumes: the `(household, foodKey)` index on `shopping_items` (Task 2).
- Produces: `rekeyFoods(em: EntityManager, keys: readonly string[]): Promise<{ renamed: number; joined: number }>`: the same per-row work as `rekeyHousehold` (keys made again, plan names tidied, lines of the same food on the same list joined, colliding placements and store products removed, in the same order and with the same flush between), over only the rows whose food is one of `keys`: `ShoppingItem.foodKey`, `FoodPlacement.foodKey`, `StoreProduct.food`, `PantryItem.foodKey`, `Purchase.foodKey`. `sameAs` passes `[from, to]`; `forgetAlias` passes the forgotten alias's two keys. If list items can have no `foodKey` (check the entity and where items are saved), those whose key from their name is one of `keys` are included too.

- [ ] **Step 1: Write the failing tests** in `rekey.test.ts`, seeding a household with rows of three foods in every table: "scallions", "green onions" and "rice".

```ts
test("Same as… leaves the household as a full rekey would", async () => {
  // sameAs "scallions" → "green onions"
  expect(await rekeyHousehold(em)).toEqual({ renamed: 0, joined: 0 })
})

test("Same as… doesn't touch rows of other foods", async () => {
  // A "rice" purchase and pantry item saved with a stale key (as an older
  // vocabulary would have made it) keep that key after Same as…, though a
  // full rekey would change it. Use a household of its own, so the stale
  // rows don't trouble the tests above.
})

test("forgetting it puts them back, and a full rekey finds nothing left", async () => {
  // forgetAlias, then expect(await rekeyHousehold(em)).toEqual({ renamed: 0, joined: 0 })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/list/rekey.test.ts`
Expected: the "doesn't touch" test FAILS (a full rekey saves every row).

- [ ] **Step 3: Implement `rekeyFoods`,** sharing the per-row work with `rekeyHousehold` rather than copying it, and use it in `teach.ts`.

- [ ] **Step 4: Run the tests**

Run: the command above, then `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/list src/services/list`, `pnpm typecheck`.
Expected: PASS, `foods.test.ts`'s **Same as…** tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "Let Same as… rekey only the rows of the two foods"
```

### Task 4: The shelf in memory, and the library matched by the household's links

**Files:**
- Create: `apps/server/src/services/recipes/discover/sites/shelf-cache.ts` (with a test beside it)
- Modify: `apps/server/src/services/recipes/discover/sites/collections.ts` (`readShelf`), `apps/server/src/services/recipes/discover/shelf-matches.ts` (its shelf read), `apps/server/src/services/recipes/discover/sites/sites.ts` (`libraryByUrl`), and where the ORM is set up (`apps/server/src/database/orm.ts`) to register the subscriber
- Test: `apps/server/src/http/routes/sites/sites.test.ts`

**Interfaces:**
- Produces:
  - `shelfRows(em: EntityManager): Promise<readonly ShelfRow[]>`: every `SiteRecipe` with `state: "recipe"`, as frozen plain objects with the fields the shelf's readers use (`fitsRule`, `pickFor`, `fitsTheme`, `suits`, `describeShelfRecipe`), ordered `publishedAt desc, createdAt desc, id desc`. Kept per database in a `WeakMap` keyed by the ORM's `Configuration` (`em.config`), so databases in one process don't share it.
  - `dropShelf(em)`, and a MikroORM `EventSubscriber` for `SiteRecipe` that calls it after any create, update or delete flushes. Check that nothing writes `SiteRecipe` with `nativeUpdate` or `nativeDelete`; if something does, call `dropShelf` there.
  - `readShelf` and the Discover shelf read use `shelfRows`. `describeForHousehold` still reads the household's library and tastes on each call.
  - `libraryByUrl(em, urls)`: up to `URLS_IN_ONE_QUERY = 100` distinct links, it reads by them as now; past that, it reads the household's recipes with a `sourceUrl` (`fields: ["slug", "name", "sourceUrl"]`, oldest first) and matches in memory. Same answer either way.

- [ ] **Step 1: Write the failing tests**

`shelf-cache.test.ts`:
```ts
test("the shelf is read once and kept", async () => {
  expect(await shelfRows(em)).toBe(await shelfRows(em))
})

test("a change to a shelf row drops it", async () => {
  // a fork creates a SiteRecipe (state "recipe") and flushes: the next
  // shelfRows is a new array holding it; the same after an update and a remove
})

test("what's kept can't be changed by a caller", async () => {
  expect(Object.isFrozen((await shelfRows(em))[0])).toBe(true)
})

test("each database keeps its own shelf", async () => {
  // a second database opened in the same process (as test/database.ts
  // opens one) with a different shelf: each shelfRows gives its own
})
```
`sites.test.ts`:
```ts
test("a recipe imported from a collection shows as in the library at once", async () => {
  // view the collection, import one of its recipes, view it again: that
  // recipe is in the library, though the shelf was kept between the views
})

test("over 100 links, the library is matched by the household's links", async () => {
  // libraryByUrl with 150 links, two of them the household's: the same
  // two found as with 2 links
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/recipes/discover src/http/routes/sites src/http/routes/collections src/http/routes/discover`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement it.**

- [ ] **Step 4: Run the tests**

Run: the command above, then `pnpm typecheck`.
Expected: PASS, the existing site, collection and Discover tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "Keep the shelf in memory until it changes, and match the library by the household's links"
```

### Task 5: Duplicates and tags read only what they need

**Files:**
- Modify: `packages/shared/src/recipes/duplicates.ts` (split candidates from reasons), `apps/server/src/services/recipes/duplicates.ts` (`library`, `duplicatesOf`, `duplicatePairs`)
- Modify: `apps/server/src/services/recipes/tags.ts` (`pruneTags`), its callers in `services/recipes/recipes.ts` (`updateRecipe`), `tags.ts` (`removeTagsFrom`) and `services/recipes/deleted.ts` (`deleteRecipes`)
- Test: `packages/shared/src/recipes/duplicates.test.ts` (or the shared duplicates test file there is), `apps/server/src/http/routes/recipes/duplicates/duplicates.test.ts`, `apps/server/src/http/routes/recipes/recipes.test.ts`

**Interfaces:**
- Produces:
  - In shared: `candidatePairs(recipes: readonly { name: string; sourceUrl: string | null }[]): [number, number][]`, the pairs `findDuplicatePairs` considers today (same link key, same name words, one name's words inside another's), and `needsFoods(a: { name: string }, b: { name: string }): boolean`, true only when one name's words are strictly inside the other's (the one case `namesMatch` asks foods). `findDuplicatePairs` is built from them and answers as now.
  - In the server: recipes are read without lines; lines are read only for the recipes in a pair that `needsFoods`, with `recipe: { $in: ids, deletedAt: null }` and `fields: ["recipe", "food", "foodKey"]`. `duplicatesOf` does the same for one recipe against the rest.
  - `pruneTags(em: EntityManager, tagIds: readonly string[])`: of those tags, removes the ones no recipe has. `updateRecipe` passes the tags the recipe lost; `removeTagsFrom` the tags it took off; `deleteRecipes` the deleted recipes' tags, read before they're removed. A recently deleted recipe's tags still count as used, as now.

- [ ] **Step 1: Write the failing tests**

Shared:
```ts
test("foods are only needed when one name is inside another", () => {
  expect(needsFoods({ name: "Chicken Curry" }, { name: "Easy Chicken Curry" })).toBe(true)
  expect(needsFoods({ name: "Chicken Curry" }, { name: "Curry Chicken" })).toBe(false)
  expect(needsFoods({ name: "Chicken Curry" }, { name: "Beef Stew" })).toBe(false)
})

test("the candidates are the pairs findDuplicatePairs weighs", () => {
  // a small library: same link, same words, a name inside another, and
  // strangers; candidatePairs gives the first three pairs only
})
```
Server, in `recipes.test.ts` beside the tag tests:
```ts
test("saving a recipe removes only the tags it lost that nothing else has", async () => {
  // recipe A ["quick", "soup"], recipe B ["soup"]: A saved with [] →
  // "quick" is gone, "soup" stays
})
```
The duplicates route's tests stay as they are and must still pass.

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm --filter @merran/shared test`, then `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/recipes`
Expected: the shared tests FAIL (no such exports); the tag test may pass already, as pruning everything also removes "quick", so it pins behaviour, not the change.

- [ ] **Step 3: Implement it.**

- [ ] **Step 4: Run the tests**

Run: the commands above, then `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/recipes src/services/recipes`, `pnpm typecheck`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server packages/shared
git commit -m "Read ingredient lines for duplicates only where foods decide, and prune only the tags a change touched"
```

### Task 6: The daily clean-up clears what nothing cleared

**Files:**
- Create: `apps/server/src/services/stores/clean-up.ts`, `apps/server/src/services/auth/clean-up.ts`, `apps/server/src/services/proposals/clean-up.ts`, each with a test beside it
- Modify: `apps/server/src/services/jobs/clean-up.ts` (calls them and returns their counts), `apps/server/src/services/stores/history.ts` (export `HISTORY_DAYS`)

**Interfaces:**
- Produces:
  - `clearOldPrices(em): Promise<number>`: `StorePrice` rows with `day < addDays(today, -(HISTORY_DAYS + 1))`, today being the server's date in UTC, across households (a household's own today is at most a day off, which the extra day covers). `KEEP_PRICES_DAYS = HISTORY_DAYS + 1`.
  - `clearExpiredSignIns(em): Promise<{ sessions, verifications, tokens, rateLimits }>`: sessions, verifications, OAuth access and refresh tokens and client assertions whose `expiresAt` has passed, and rate-limit rows whose `lastRequest` is more than a day ago (`KEEP_RATE_LIMITS_MS = 86_400_000`). Removing sessions before tokens is fine: tokens' session is set null.
  - `clearOldProposals(em): Promise<number>`: proposals `applied` or `dismissed` with `resolvedAt` more than `KEEP_PROPOSALS_DAYS = 30` ago, whose `chat` is null or names a chat that no longer exists. Pending ones and ones from a chat that exists stay.
  - `jobs.cleanUp`'s result gains `prices`, `signIns` and `proposals`.

- [ ] **Step 1: Write the failing tests**, one file each, seeding rows directly:

```ts
test("prices past 91 days go, and the 90 days read stay", async () => {})
test("expired sessions, verifications and tokens go, and live ones stay", async () => {})
test("rate limits idle for a day go", async () => {})
test("suggestions resolved 30 days ago go, unless their chat still shows them", async () => {
  // resolved 31 days ago with no chat: gone; with a chat that exists:
  // stays; with a chat that was deleted: gone; pending 60 days: stays;
  // resolved 29 days ago: stays
})
```
And in a jobs test: running `jobs.cleanUp` reports `prices`, `signIns` and `proposals`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/stores/clean-up.test.ts src/services/auth/clean-up.test.ts src/services/proposals/clean-up.test.ts`
Expected: FAIL, the modules don't exist.

- [ ] **Step 3: Implement them** with `nativeDelete` and the across-households option, as `services/webhooks/clean-up.ts` does.

- [ ] **Step 4: Run the tests**

Run: the command above, then `pnpm --filter @merran/server exec vitest run --project sqlite src/services/jobs src/http/routes/auth src/http/routes/stores`, `pnpm typecheck`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "Clear old prices, expired sign-ins and old suggestions each night"
```

### Task 7: SQLite's settings when its connection opens

**Files:**
- Modify: `apps/server/src/database/orm.ts` (`openDatabase`), `apps/server/src/services/jobs/clean-up.ts` (the nightly `optimize`)
- Test: `apps/server/src/database/orm.test.ts` (create it if there's none)

**Interfaces:**
- Produces: `SQLITE_PRAGMAS` in `orm.ts`, the list from decision 7, run by MikroORM's `onCreateConnection` (it receives Kysely's connection: run each with `executeQuery(CompiledQuery.raw(...))`, taking `CompiledQuery` from the Kysely MikroORM already uses, re-exported or as a direct dependency at the version the lockfile has) for SQLite only, in place of the two `execute` calls after `init`. Once open, `pragma optimize = 0x10002`. The nightly clean-up runs `pragma optimize` on SQLite only.

- [ ] **Step 1: Write the failing test**

```ts
test("SQLite's settings are applied when it opens", async () => {
  // openDatabase on a file in a temp folder (in memory there's no WAL)
  // reads back: journal_mode "wal", synchronous 1, temp_store 2,
  // busy_timeout 5000, cache_size -65536
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/database/orm.test.ts`
Expected: FAIL on `synchronous`, `temp_store` and `cache_size`.

- [ ] **Step 3: Implement it.** Then answer the finding's "unsure, worth a test" in a comment where it applies, from reading the code: with one SQLite connection, a query from another fork waits for an open transaction to end (Kysely's connection mutex), so code inside a transaction must never await another fork's query. Check the two cold-settings reads (`services/ai/keys.ts`, `http/auth/better-auth-handler.ts`) and the job runner's `progress` are outside transactions, and say what you found in the report.

- [ ] **Step 4: Run the tests**

Run: the command above, then the whole server suite once: `pnpm --filter @merran/server exec vitest run --project sqlite`, and `pnpm typecheck`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "Apply SQLite's settings as its connection opens, and let it optimize itself"
```

### Task 8: Docs

**Files:**
- Modify: `docs/performance.md`:
  - "What slice 7 built" after slice 6's, with the decisions above and what was decided while building.
  - Slice 7's row: built, with the date; the opening paragraph's list of slices.
  - Each finding it fixes marked "Fixed in slice 7": queries 1–8, the usual buys index, SQLite's settings, and the "unsure" item answered. What slice 6 left for slice 7 (the shelf per collection page) and slice 5's (each Discover round) marked too.
  - Note, for later: sales and costs match a recipe's foods without the household's **Same as…** (found while planning; unchanged here).
- Modify: `docs/operations.md`, and the site's `run/` pages, if they say what Merran keeps or clears (search for "clean", "keeps", "90 days", "30 days").
- Modify: `docs/features.md` only for a row whose behaviour changed (usual buys from the last year).

- [ ] **Step 1: Write them.** By hand; never run Prettier on `docs/`.
- [ ] **Step 2: Run `pnpm docs:build`.** Expected: it builds, and its links check.
- [ ] **Step 3: Commit**

```bash
git add docs apps/docs
git commit -m "Say what slice 7 built"
```
