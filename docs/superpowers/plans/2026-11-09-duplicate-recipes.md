# Possible duplicate recipes: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Point out recipes that are probably the same one (same link under any address, or the same name), with no AI: on a new recipe, on a Possible duplicates page, and in Tidy up's Review.

**Architecture:** A pure matcher in `packages/shared` (link keys, name words, the pair rule). A server service runs it over the household's recipes on each request and leaves out pairs kept in a new `recipe_not_duplicates` table. Link imports compare link keys. The web shows the results in three places from two read routes and one dismiss route.

**Tech Stack:** TypeScript, Vitest, Hono with zod-openapi, MikroORM (SQLite and Postgres), React with TanStack Router and Query, i18next, node:test for web helpers.

**Spec:** [docs/superpowers/specs/2026-11-09-duplicate-recipes-design.md](../specs/2026-11-09-duplicate-recipes-design.md)

## Global constraints

- Work in `D:\Development\Mise\.claude\worktrees\duplicate-recipes`, branch `feat/duplicate-recipes`. Never touch the main checkout or the user's dev servers on ports 3000 and 5173.
- No AI anywhere in this feature.
- Reasons are `"link"` and `"name"`, in that order. People read **Same link** and **Same name**.
- Words people read go in `apps/web/src/locales/en.json` under `recipes.duplicates`, quoted exactly in the guide.
- Mobile uses drawers: the delete confirmation is the existing `DeleteRecipesDialog`, already a drawer on phones.
- Routes mirror the API: one file per method, `[param]` folders, and an `index.ts` that only registers.
- Run Prettier from the root (`pnpm format`), never on `docs/`. Run the `api` scripts in PowerShell with `$env:pnpm_config_cache_dir = "D:\Development\Mise\.local\pnpm-cache"`.
- Match the code around you: plain-English comments that say why, normal line breaks, named helpers.
- Every commit ends with `Co-authored-by: bula87 <bula87@gmail.com>` and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- TDD: write each test, watch it fail for the right reason, then write the code.

## Review focus

1. **A recipe matching itself, or its own pair twice.** It must never appear in its own duplicates, and the list shows each pair once. Pinned in Tasks 1 and 2.
2. **Recently deleted recipes.** They never match. Putting one back doesn't bring back a pair dismissed before, and deleting it for good removes its dismissals. Pinned in Task 2.
3. **Another household's recipes.** They never match, and can't be dismissed against (404). Pinned in Task 2.
4. **A recipe whose link can't be parsed, or that has no ingredients.** It still matches by same name, never crashes, and a name inside another needs foods. Pinned in Task 1.
5. **A big library.** `findDuplicatePairs` indexes by link key and name word rather than comparing every pair, and a 2,000-recipe list finishes quickly. Pinned in Task 1.

---

### Task 1: The shared matcher

**Files:**
- Create: `packages/shared/src/recipes/duplicates.ts`
- Test: `packages/shared/src/recipes/duplicates.test.ts`
- Modify: `packages/shared/src/index.ts` (export it)
- Modify: `apps/server/src/services/recipes/import/links.ts` (`normalizeLink` reads the shared tracking list)

**Interfaces:**
- Produces, from `@merran/shared`:
  - `TRACKING_PARAM: RegExp`, the pattern `normalizeLink` has today: `/^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|igshid|igsh|si|feature|_r|_t)$/i`
  - `linkKey(url: string): string | null`
  - `nameWords(name: string): Set<string>`
  - `foodWord(food: string): string`, a food lowercased and made singular word by word
  - `type DuplicateReason = "link" | "name"`
  - `type DuplicateCandidate = { name: string; sourceUrl: string | null; foods: readonly string[] }`, where `foods` are already passed through `foodWord`
  - `duplicateReasons(a: DuplicateCandidate, b: DuplicateCandidate): DuplicateReason[]`
  - `findDuplicatePairs(recipes: readonly (DuplicateCandidate & { id: string })[]): { a: string; b: string; reasons: DuplicateReason[] }[]`

The rules, word lists and thresholds are exactly the spec's "What counts as a match".

- [ ] **Step 1: Write the failing tests**

`describe("linkKey")`:
- `"one page under any address"`: `https://www.example.com/lemon-chicken/?utm_source=x`, `http://example.com/lemon-chicken`, `https://example.com/lemon-chicken/print/` and `https://amp.example.com/lemon-chicken/amp` all give `"example.com/lemon-chicken"`.
- `"another page or another post is another key"`: `example.com/lemon-cake` differs from `example.com/lemon-chicken`, and `?p=12` differs from `?p=13`.
- `"keeps parameters that aren't tracking, in order"`: `https://example.com/r?b=2&a=1&fbclid=z` gives `"example.com/r?a=1&b=2"`.
- `"has none for what isn't a web link"`: `ftp://example.com/x`, `"not a link"` and `""` give `null`.

`describe("nameWords")`:
- `"the same for order, case, accents, filler and plurals"`: `"Easy Lemon Chickens"` and `"The chicken with lemon"` both give `new Set(["lemon", "chicken"])`. `"Crème Brûlée"` gives `new Set(["creme", "brulee"])`.
- `"singular words, carefully"`: `"Tomatoes"` gives `tomato`, `"Cookies"` gives `cooky`, `"Dishes"` gives `dish`, `"Ribs"` gives `rib`, and `"Hummus"`, `"Glass"` and `"Couscous"` stay as they are.
- `"is empty for a name that's all filler"`: `"Recipe"` and `"The Best Easy Recipe"` give empty sets.

`describe("duplicateReasons")`, with a helper `recipe(name, sourceUrl = null, foods = [])`:
- `"same link"` gives `["link"]`.
- `"same name words"` gives `["name"]`.
- `"both, in order"` gives `["link", "name"]`.
- `"a name inside another, with most foods shared"`: "Lemon Chicken" (chicken, lemon, garlic, salt) and "Sticky Lemon Chicken" (chicken, lemon, garlic, honey, soy) give `["name"]`: 3 of 4.
- `"not with too few foods shared"`: the same names sharing only chicken and lemon give `[]`.
- `"not when the shared foods are too small a part"`: 3 shared out of the smaller recipe's 5 (60%) gives `[]`.
- `"not without foods"`: "Chili" and "White Chicken Chili" with no foods give `[]`.
- `"not for names with nothing in common"` gives `[]`.
- `"never by an empty name"`: "Recipe" and "The Recipe" give `[]`.
- `"a link that can't be read still matches by name"`: `sourceUrl: "nonsense"` on both, same name, gives `["name"]`.

`describe("findDuplicatePairs")`:
- `"each pair once, earlier first"`: three recipes where only the first and third match give `[{ a: "1", b: "3", reasons: ["name"] }]`.
- `"three copies make three pairs"` gives 3 pairs.
- `"none in a library without any"` gives `[]`.
- `"a big library doesn't compare every pair"`: 2,000 recipes named `Dish ${i}` with distinct links and foods return `[]` in under 500 ms (`performance.now()`). Every name shares "dish", so a loop over recipes sharing any word would still be quadratic.

The index the big-library test needs:
- Same link: a map from link key to recipes.
- Same words: a map from the sorted word set, joined, to recipes.
- A name inside another: a map from each word to the recipes with it. For each recipe X with words, take X's word with the fewest recipes. Only recipes with that word, more words than X, and every one of X's words can have X's name inside theirs: check `duplicateReasons` on just those.

Merge the reasons each pair gets from the three into one entry, `a` being the earlier in the input.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @merran/shared test`
Expected: fails on the missing module. Write `duplicates.ts` with the exports returning `null`, empty sets and `[]`, then watch each test fail on its assertion. The three "not" tests and "none" may pass against stubs: that's expected, since they guard the rules.

- [ ] **Step 3: Implement**

`linkKey`, `nameWords`, `foodWord` and `duplicateReasons` as the spec says, and `findDuplicatePairs` with the index described in the big-library test. Export the module from `packages/shared/src/index.ts`, next to the other `./recipes/` lines if there are any, else in alphabetical order. `normalizeLink` in `links.ts` imports `TRACKING_PARAM` instead of keeping its own copy.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm --filter @merran/shared test`, then `pnpm --filter @merran/server test -- import`
Expected: all pass. The server run includes its existing link import tests, which use `normalizeLink`.

- [ ] **Step 5: Commit**

Message: "Match recipes that are probably the same one", with a body saying why (same link under any address, or the same name words), and both trailers.

---

### Task 2: Possible duplicates on the server

**Files:**
- Create: `apps/server/src/database/entities/recipe_not_duplicates.ts`, registered in `entities/index.ts` like `RecipePairing`
- Create: migrations through `pnpm --filter @merran/server db:migration recipe-not-duplicates`
- Create: `apps/server/src/services/recipes/duplicates.ts`
- Create: `apps/server/src/http/routes/recipes/duplicates/{index,get}.ts`, registered in `routes/recipes/index.ts` with the other fixed paths, before `recipeRoutes`
- Create: `apps/server/src/http/routes/recipes/[recipe]/duplicates/{index,get}.ts`, and `[recipe]/duplicates/[other]/index.ts`, `[recipe]/duplicates/[other]/dismiss/{index,post}.ts`, registered from `[recipe]/index.ts`
- Modify: `apps/server/src/http/schemas/recipes.ts`:
  - `RecipeDuplicateSchema` (`.openapi("RecipeDuplicate")`)
  - `DuplicatePairSchema` (`"DuplicatePair"`)
  - `RecipeDuplicatesSchema` (`"RecipeDuplicates"`)
  - `DuplicatePairsSchema` (`"DuplicatePairs"`)
  - `DuplicateParam`, which is `RecipeParam` plus `other`: "The other recipe's id, or its slug."
- Modify: `apps/server/src/services/recipes/slugs.ts` (`"duplicates"` in `RESERVED`)
- Test: `apps/server/src/http/routes/recipes/duplicates/duplicates.test.ts`
- Regenerate: `openapi.json`, `apps/web/src/lib/api/schema.d.ts`, `apps/extension/src/lib/schema.d.ts`

**Interfaces:**
- Consumes: Task 1's `foodWord`, `duplicateReasons`, `findDuplicatePairs`, `DuplicateReason`.
- Produces:
  - Entity `RecipeNotDuplicate`:
    - `id`
    - `household: householdRef()`
    - `first: recipeRef()`
    - `second`, a cascade-deleting `manyToOne(Recipe)` with an index
    - `createdBy`, a `manyToOne(User)`, nullable, set null on delete
    - `createdAt`
    - unique on `["first", "second"]`, with `filters: householdFilter`
  - Service, in `services/recipes/duplicates.ts`:
    - `type RecipeDuplicate = { id: string; slug: string; name: string; photo: string | null; sourceUrl: string | null; createdAt: string; reasons: DuplicateReason[] }`
    - `type DuplicatePair = { recipes: [RecipeDuplicate, RecipeDuplicate]; reasons: DuplicateReason[] }`
    - `duplicatesOf(em: EntityManager, recipe: string): Promise<RecipeDuplicate[]>`, where `recipe` is an id or slug
    - `duplicatePairs(em: EntityManager): Promise<DuplicatePair[]>`
    - `dismissDuplicate(em: EntityManager, recipe: string, other: string, userId: string | null): Promise<void>`
  - API:
    - `GET /api/recipes/{recipe}/duplicates` gives `{ duplicates: RecipeDuplicate[] }` (operationId `listRecipeDuplicates`, schema `RecipeDuplicates`)
    - `GET /api/recipes/duplicates` gives `{ pairs: DuplicatePair[] }` (operationId `listDuplicatePairs`, schema `DuplicatePairs`)
    - `POST /api/recipes/{recipe}/duplicates/{other}/dismiss` gives 204 (operationId `dismissDuplicate`)

Notes for the service:
- `photo` is `photoUrls(recipe)?.card ?? null` (from `services/recipes/photos/photos.ts`), so load `image`, not a `photo` field.
- Load the household's recipes (`id`, `slug`, `name`, `sourceUrl`, `image`, `createdAt`) and then their `RecipeIngredient` rows (`recipe`, `food`, `foodKey`) in two queries. The scoped `em` already leaves out other households and Recently deleted.
- Dismissed pairs are one query, read into a set of `"<first>|<second>"`.
- `duplicatesOf` orders link matches first, then by `createdAt` ascending. `duplicatePairs` orders by the later recipe's `createdAt` descending, older recipe first in each pair.
- `dismissDuplicate`:
  - finds both through `findRecipe`, which gives the 404 the `[recipe]` routes give
  - throws `AppError("invalid", "same_recipe", "That's the same recipe.")` when they're one recipe
  - orders the ids
  - does nothing if the row exists

- [ ] **Step 1: Write the failing tests**

In `duplicates.test.ts`, set up as `pairings.test.ts` does (`createTestApp`, `setUpServer`). Add Sam in another household as `receipts.test.ts` does (`kyle.post("/api/households", …)`, `join(app, await inviteToken(kyle), account("sam", "Sam"))`, then set Kyle's active household back).

Kyle makes these with `POST /api/recipes`:
- "Lemon Chicken", `sourceUrl: "https://cooking.example/lemon-chicken"`, ingredients `["4 chicken thighs", "2 lemons", "3 cloves garlic", "1 tsp salt"]`
- "Chicken with Lemon", no link
- "Roast Lemon Chicken Thighs", `sourceUrl: "http://www.cooking.example/lemon-chicken/"`
- "Tomato Soup"

Sam makes "Lemon Chicken" in his household.

- `"finds a recipe's duplicates, the same link first"`: `GET /api/recipes/lemon-chicken/duplicates` gives `duplicates.map(d => [d.name, d.reasons])` equal to `[["Roast Lemon Chicken Thighs", ["link"]], ["Chicken with Lemon", ["name"]]]`. Each has `slug`, `createdAt` and `photo: null`. Sam's is absent, and Tomato Soup is absent.
- `"lists each pair once, newest first"`: `GET /api/recipes/duplicates` gives pairs whose names are `[["Lemon Chicken", "Roast Lemon Chicken Thighs"], ["Lemon Chicken", "Chicken with Lemon"]]` (each pair's older recipe first; the newer pair first). There's no pair of "Chicken with Lemon" with "Roast Lemon Chicken Thighs": their words are a subset, and the second has no foods.
- `"leaves out Recently deleted recipes, and doesn't bring dismissed pairs back with them"`:
  - Dismiss Lemon Chicken against Chicken with Lemon, then `DELETE /api/recipes/chicken-with-lemon`. Neither read lists it.
  - Restore it through `POST /api/recipes/deleted/{id}/restore`. It's still not listed.
- `"keeps 'not the same' for everyone, and saying it twice is fine"`: dismiss Lemon Chicken against Roast Lemon Chicken Thighs twice, both 204. Sam's household never sees it. Kyle's reads leave the pair out for a second household member, so invite Jamie into Kyle's household for this.
- `"won't dismiss a recipe against itself, or another household's"`: `lemon-chicken` against `lemon-chicken` is 400 `same_recipe`. Against Sam's recipe id it's 404.
- `"takes its dismissals with it when deleted for good"`: delete Chicken with Lemon for good (`DELETE /api/recipes/deleted/{id}`). Through `database.em`, with the household filter off, no `RecipeNotDuplicate` row names it.
- `"is open to keys that may read, and dismissing to keys that may write"`: a key with `recipes: "read"` can GET both and gets 403 dismissing.
- `"keeps the word for its own page"`: `POST /api/recipes` named "Duplicates" gets a slug other than `duplicates`.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @merran/server test -- recipes/duplicates`
Expected: 404s from routes that don't exist yet, and the slug test failing with `duplicates`.

- [ ] **Step 3: The entity and its migrations**

Add the entity, then run `pnpm --filter @merran/server db:migration recipe-not-duplicates`.
Expected: one new migration in `database/migrations/sqlite` and one in `database/migrations/postgres`, each creating only `recipe_not_duplicates` with its indexes, unique and foreign keys. Anything else in them is drift: take it out. The SQLite generator rebuilds tables for drift, which cascade-deletes rows.

- [ ] **Step 4: The service, schemas and routes**

Write the service, then the schemas with descriptions and examples like the neighbouring ones, then the routes. Response codes:
- `[recipe]/duplicates` GET: 200 and 404.
- `duplicates` GET: 200.
- `dismiss` POST: 204, 400 and 404.

Add `"duplicates"` to `RESERVED`.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm --filter @merran/server test -- recipes/duplicates`
Expected: pass. Then the whole server suite, `pnpm --filter @merran/server test`, which includes the route-layout and migration tests. Expected: all pass, apart from the stale `openapi.json`.

- [ ] **Step 6: Regenerate the API, typecheck, and commit**

Run `pnpm --filter @merran/server openapi`, then `pnpm run api` in `apps/web` and `apps/extension`, through PowerShell with the cache variable.
Expected:
- `diff` of the two `schema.d.ts` files prints nothing.
- `pnpm typecheck` passes.
- `pnpm --filter @merran/server test -- openapi` passes.

Commit message: "List possible duplicate recipes, and let a household say they're not", with both trailers.

---

### Task 3: Link imports catch the same page under another address

**Files:**
- Modify: `apps/server/src/services/recipes/import/links.ts` (`findBySourceUrl`)
- Test: `apps/server/src/http/routes/recipes/import/import.test.ts`

**Interfaces:**
- Consumes: Task 1's `linkKey`.
- Produces: `findBySourceUrl(em: EntityManager, urls: string[])`, same signature and return. It now compares `linkKey`s, loading the household's recipes that have a `sourceUrl` (`id`, `sourceUrl`, `createdAt`, oldest first) and returning the first whose key is among the keys of `urls`. A link with no key is compared as it is.

- [ ] **Step 1: Write the failing test**

In `import.test.ts`, after `"gives back the recipe already imported from a link"`, add `"knows the same page under another address"`:
- `importLink("http://www.cooking.example/soup/")` gives 200 with `duplicate: true`.
- `importLink("https://cooking.example/soup/print")` does too.

The duplicate check runs before anything is fetched, so the fake web needs no new pages.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @merran/server test -- recipes/import/import`
Expected: the new test fails with the fake web's `site_unreachable` error rather than 200: the old exact comparison misses, so the import tries to fetch a page the fake web doesn't have.

- [ ] **Step 3: Implement the new `findBySourceUrl`.**

- [ ] **Step 4: Run the import tests and watch them pass**

Run: `pnpm --filter @merran/server test -- recipes/import`
Expected: all pass, the existing "imports again when asked to" (`force`) included.

- [ ] **Step 5: Commit**

Message: "Know a recipe's page under another address when importing it", with both trailers.

---

### Task 4: On a new recipe, and in Review

**Files:**
- Create: `apps/web/src/features/recipes/duplicates/queries.ts`
- Create: `apps/web/src/features/recipes/duplicates/new-recipe.ts`, and `new-recipe.test.ts` (added to the web `test` script)
- Create: `apps/web/src/features/recipes/duplicates/duplicate-links.tsx`
- Create: `apps/web/src/features/recipes/duplicates/duplicates-note.tsx`
- Modify: `apps/web/src/routes/_app/recipes/$slug/index.tsx` (the note, first in the `<article>`, after the plan's `adjustedHint` paragraph)
- Modify: `apps/web/src/features/recipes/tidy/proposal-review.tsx` (a "Possible duplicates" section when `proposal.recipe` has any)
- Modify: `apps/web/src/locales/en.json`

**Interfaces:**
- Consumes: Task 2's API.
- Produces:
  - In `queries.ts`:
    - `recipeDuplicatesQuery(recipe: string)` with key `["recipes", "duplicates", recipe]`
    - `duplicatePairsQuery` with key `["recipes", "duplicates"]`
    - `useDismissDuplicate(): (recipe: string, other: string) => Promise<void>`, which posts and then invalidates `["recipes", "duplicates"]`
    - `type RecipeDuplicate = Schemas["RecipeDuplicate"]`
    - `type DuplicatePair = Schemas["DuplicatePair"]`
  - `isNewRecipe(createdAt: string, now?: number): boolean` in `new-recipe.ts`: added less than 7 days ago.
  - `DuplicateLinks({ recipe, duplicates }: { recipe: string; duplicates: readonly RecipeDuplicate[] })`: one row per duplicate, with its name linking to `/recipes/$slug`, its reasons, **Open it** and **Not the same**.
  - `DuplicatesNote({ recipe }: { recipe: { id: string; createdAt: string } })`: nothing unless `isNewRecipe`. Then it queries (with `enabled` set from `isNewRecipe`) and shows the heading and `DuplicateLinks` when there are any.

Exact words, under `recipes.duplicates`:
- `title`: "Possible duplicates"
- `note_one`: "You may have this one already:"
- `note_other`: "You may have these already:"
- `open`: "Open it"
- `notSame`: "Not the same"
- `reasons.link`: "Same link"
- `reasons.name`: "Same name"

- [ ] **Step 1: Write the failing test for `isNewRecipe`**

`new-recipe.test.ts`, with `node:test` like `features/pantry/on-list.test.ts`:
- `"a recipe added today is new"`
- `"one added six days and 23 hours ago still is"`
- `"one added seven days ago isn't"`
- `"a date that can't be read isn't"`: `"nonsense"` gives false

Each passes `now = Date.parse("2026-11-09T12:00:00Z")`.

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test src/features/recipes/duplicates/new-recipe.test.ts` from `apps/web`.
Expected: fails on the missing module, then, with a stub returning `false`, on the first two tests.

- [ ] **Step 3: Implement `isNewRecipe`, the queries, the two components and the words.**

- `DuplicateLinks` uses the app's existing list and button styles, as `goes-with.tsx` does.
- The note is a bordered status box like the plan's `adjustedHint`, with the heading `t("recipes.duplicates.note", { count })`.
- On the recipe page, render `<DuplicatesNote recipe={recipe} />` only when there's no `meal` in the search.
- In `ProposalReview`, when `proposal.recipe` is set, query its duplicates and, if there are any, show a `title` heading and `DuplicateLinks`, above the sections.

- [ ] **Step 4: Check**

Run, from the root:
- `pnpm --filter @merran/web test`: all pass.
- `pnpm typecheck`: passes.
- `pnpm format`, then `pnpm format:check`: passes.

- [ ] **Step 5: Commit**

Message: "Say when a new recipe may be one the household already has", with both trailers.

---

### Task 5: The Possible duplicates page

**Files:**
- Create: `apps/web/src/routes/_app/recipes/duplicates.tsx`
- Create: `apps/web/src/features/recipes/duplicates/pair-card.tsx`
- Modify: `apps/web/src/routes/_app/recipes/index.tsx` (**Possible duplicates** in the **More** menu, before **Recently deleted**)
- Modify: `apps/web/src/locales/en.json`

**Interfaces:**
- Consumes: Task 4's `duplicatePairsQuery`, `useDismissDuplicate` and `DuplicatePair`, and the existing `DeleteRecipesDialog({ recipes, open, onOpenChange, onDeleted })`.
- Produces: `DuplicatePairCard({ pair }: { pair: DuplicatePair })`.

More words, under `recipes.duplicates`:
- `openRecipe`: "Open"
- `added`: "Added {{date}}"
- `empty`: "No possible duplicates. Recipes with the same link or the same name show here."
- `description`: "Recipes that look like the same one: the same page, or the same name."

**Delete** reuses `recipes.delete`.

- [ ] **Step 1: The page and the card**

- The page has a `PageHeader` (`title`, `description`) and a back link to Recipes, as `deleted.tsx` has, then one `DuplicatePairCard` per pair, or the empty line.
- The card shows the reasons, then the two recipes side by side, stacking on phones (`grid sm:grid-cols-2`). Each side has its photo (or the app's placeholder, as `recipe-card.tsx` does), its name, the link's host when there's a `sourceUrl`, **Added {date}** formatted for the person's language, **Open** and **Delete**.
- Under the two is **Not the same**.
- **Delete** opens `DeleteRecipesDialog` with that one recipe.
- The menu item uses a matching Hugeicons icon (`Copy01Icon`).

- [ ] **Step 2: Check**

Run: `pnpm typecheck`, `pnpm format`, then `pnpm format:check`.
Expected: both pass.

- [ ] **Step 3: Look at it in a browser**

The user's API runs main, without the new table, so use a throwaway pair as the last plan did:
- Node launchers in this worktree's git-ignored `apps/web/.local/`: the API on 3001 with `MERRAN_DATA_DIR` in the scratchpad; Vite on a free port proxying to 3001.
- Temporary entries in the main checkout's `.claude/launch.json`, removed once the servers are up.
- Set up with the code from the API's log, and make Task 2's four recipes through the API from the page.

Check on desktop and at 375 px:
- Opening "Roast Lemon Chicken Thighs" shows the note with **Same link** and a link to Lemon Chicken. **Not the same** takes that row away.
- Opening a recipe from the plan (with `meal`) shows no note.
- **More → Possible duplicates** lists the pairs, side by side, then stacked at 375 px with no sideways scrolling.
- **Not the same** takes a pair off.
- **Delete** opens the drawer at 375 px and the dialog on desktop, the pair goes, and **Undo** brings it back.
- The console shows no errors.

Tidy up's Review needs AI, so its section is checked only by the typecheck: say so. Stop the servers and delete the scratch data afterwards.

- [ ] **Step 4: Commit**

Message: "Add a page of possible duplicate recipes", with both trailers.

---

### Task 6: Docs, checks and the pull request

**Files:**
- Modify: `docs/features.md`
- Modify: `docs/scope.md`
- Modify: `apps/docs/src/content/docs/docs/use/recipes.md`

- [ ] **Step 1: Feature list and scope**

- `docs/features.md`, near "Tags: rename, merge, delete": `| Possible duplicate recipes | Detail | Built | No AI: the same link under any address, or the same name by its words; noted on new recipes, listed under Recipes → Possible duplicates, and in Tidy up's Review; "Not the same" is kept for the household |`.
- The "Import from a link" row's note adds that **You have this one** knows the same page under another address.
- `docs/scope.md`, under "### Recipes": the same row in that table's form. Below the table, a line dated November 9, 2026: what counts as a match (the spec's rules, briefly), that it needs no AI, and that merging is left out because moving plans, notes, ratings and versions across is its own design.

- [ ] **Step 2: Guide**

In `use/recipes.md`:
- Under "From a website", after the **You have this one** paragraph: it also knows the page under another address (`http` or `https`, with or without `www.`, its print version).
- Under "Edit and organize": a paragraph on **Possible duplicates** in **More**. It covers what's listed (**Same link**, **Same name**), **Open**, **Not the same** and **Delete**, and that a recipe added in the last 7 days notes "You may have this one already:" with **Open it** and **Not the same**.

Labels are quoted exactly as `en.json` has them.

- [ ] **Step 3: Run every check the change touches**

Each must pass:
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm --filter @merran/shared test`
- `pnpm --filter @merran/server test`
- `pnpm --filter @merran/web test`
- `pnpm --filter @merran/extension build`
- `pnpm docs:build`

Then Postgres: `pnpm exec vitest run --project postgres` from `apps/server`, against the running test container (`pnpm --filter @merran/server db:test-postgres` if there's none). Name any failure. A file that times out under load is run again on its own before it's called load.

- [ ] **Step 4: Commit, review, push, open the pull request**

- Commit the docs: "Describe possible duplicate recipes", with both trailers.
- After the whole-branch review and its fixes, `git push -u origin feat/duplicate-recipes`.
- `gh pr create --repo merran-app/merran` titled `feat: point out possible duplicate recipes`. The body says:
  - what it does and why, crediting bula87's fork commit 935e076 and how this differs
  - the matching rules
  - what was checked, and what wasn't (Review's section, in a browser)
  - and it ends with "🤖 Generated with [Claude Code](https://claude.com/claude-code)".
- Check it's bound with the ccd_pr tools.
