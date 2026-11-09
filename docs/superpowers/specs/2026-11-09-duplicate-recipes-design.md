# Possible duplicate recipes

Design agreed November 9, 2026. It ports the idea behind bula87's fork ([935e076](https://github.com/bula87/merran/commit/935e076)), which listed possible duplicates in a tidy-up's Review. That check matched names by slug prefix, compared raw links, and only ran inside an AI tidy-up. Here the check needs no AI, matches names by their words and links by a tidied key, and shows in three places.

## What it's for

A library collects the same recipe twice:

- from the same page under another address (`http` and `https`, with or without `www.`, its print or AMP version)
- typed in, read from a photo, or shared, when it was imported before
- brought over from Mealie or Paprika next to recipes added by hand

Merran today only catches one case. A link import whose link, minus tracking parameters, matches a recipe's exactly gives **You have this one**. Nothing else is checked.

Done means:

- A recipe added in the last 7 days that looks like one the household already has says so when it's opened, with a link to the other one.
- **Recipes → Possible duplicates** lists every pair in the library, to open, mark as not the same, or delete one of.
- Tidy up's Review lists the recipe's possible duplicates beside its suggestions.
- A link import catches the same page under another address before importing, with the existing **You have this one**.
- **Not the same** stops a pair being shown again, for everyone in the household.
- None of it needs AI.

Out of scope:

- Merging two recipes into one, moving plans, notes, ratings and versions across.
- AI matching.
- A warning in the typed-in form before saving.
- Making a tidy-up suggestion only to report duplicates: the list is where those live.

## Words

- A **pair** is two of the household's recipes, not in Recently deleted, that match.
- A pair's **reasons** are why it matched: `link` (**Same link**), `name` (**Same name**), or both.
- A pair is **dismissed** once someone in the household says it's **Not the same**.

## What counts as a match

All in a pure module, `packages/shared/src/recipes/duplicates.ts`, exported from the package's index. The server is its only caller.

### Same link

`linkKey(url: string): string | null` reduces a link to a key. Two recipes whose `sourceUrl`s have the same key match.

- Only `http` and `https` links have a key. Anything else, or text that isn't a link, is null.
- The scheme is ignored.
- The host is lowercased, without a leading `www.`, `m.` or `amp.`.
- The path drops a trailing `/`, then a final `/amp` or `/print` segment.
- The query drops the tracking parameters `normalizeLink` already drops (`utm_*`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `igshid`, `igsh`, `si`, `feature`, `_r`, `_t`), plus `amp` and `print`. The parameters left are sorted.
- The `#` part goes.

So `https://www.example.com/lemon-chicken/?utm_source=x`, `http://example.com/lemon-chicken`, `https://example.com/lemon-chicken/print/` and `https://amp.example.com/lemon-chicken/amp` share the key `example.com/lemon-chicken`.

The tracking parameter list moves into the shared module, so `normalizeLink` and `linkKey` read the same one.

### Same name

`nameWords(name: string): Set<string>` gives the words a name is about:

- Lowercased, with accents dropped ("Crème" is "creme").
- Split into runs of letters and digits.
- Without filler: `a`, `an`, `and`, `the`, `with`, `of`, `in`, `on`, `for`, `my`, `our`, `your`, `easy`, `best`, `quick`, `simple`, `homemade`, `perfect`, `ultimate`, `recipe`, `recipes`.
- Each word made singular when it's longer than three letters:
  - `ies` becomes `y`
  - `oes` becomes `o`
  - `ses`, `xes`, `ches` and `shes` drop their `es`
  - otherwise a final `s` goes, unless the word ends in `ss`, `us` or `is`.

Two recipes match by name when:

- their word sets are the same and not empty ("Easy Lemon Chicken" and "Chicken with Lemon"), or
- one set is inside the other, isn't empty, and their ingredients agree. "Lemon Chicken" and "Sticky Lemon Chicken" match only when they share at least 3 foods, and those are at least 70% of the foods of whichever recipe has fewer.

A recipe's foods are its ingredient lines' `foodKey ?? food`, lowercased and made singular word by word, as a set. Lines with neither are left out.

### The pair rule

`duplicateReasons(a: DuplicateCandidate, b: DuplicateCandidate): DuplicateReason[]` gives the reasons a pair matches, in the order `link`, `name`. An empty array means no match.

- `DuplicateCandidate` is `{ name: string; sourceUrl: string | null; foods: readonly string[] }`.
- `DuplicateReason` is `"link" | "name"`.

`findDuplicatePairs(recipes: readonly (DuplicateCandidate & { id: string })[]): { a: string; b: string; reasons: DuplicateReason[] }[]` finds every matching pair in a list, each once, with `a` the earlier in the list. It indexes recipes by link key and by name word, so it doesn't compare every recipe with every other.

## Server

### Dismissed pairs

A new entity, `RecipeNotDuplicate` (table `recipe_not_duplicates`):

| Field | |
|---|---|
| `id` | |
| `household` | The household, scoped like recipes |
| `first` | One recipe, the one with the smaller id |
| `second` | The other recipe |
| `createdBy` | Who said so, null if they're gone |
| `createdAt` | |

- A pair is kept once: `first` and `second` are ordered by id, and unique together.
- Rows go with either recipe when it's deleted for good (cascade). Recently deleted keeps them, so putting a recipe back doesn't bring dismissed pairs back.
- `pnpm --filter @merran/server db:migration recipe-not-duplicates` writes the migrations for SQLite and Postgres.

### The service

`apps/server/src/services/recipes/duplicates.ts`:

- `duplicatesOf(em, recipeId): Promise<RecipeDuplicate[]>`: the recipe's matches among the household's other recipes, without dismissed pairs. Link matches come first, then oldest first.
- `duplicatePairs(em): Promise<DuplicatePair[]>`: every pair in the household, without dismissed ones. Newest first, by the later recipe's `createdAt`.
- `dismissDuplicate(em, recipeId, otherId, userId): Promise<void>`: keeps a pair as not the same. Saying so twice is fine.

Both reads load each recipe's `id`, `slug`, `name`, `sourceUrl`, `photo` and `createdAt`, plus its ingredient lines' `food` and `foodKey`, in two queries for the household. Recently deleted recipes are left out by the existing filter.

### Routes

Each in its own file, as routes mirror the API. Words in errors are plain English, as elsewhere.

- **`GET /api/recipes/{recipe}/duplicates`** (`recipes` read, open to keys): `{ duplicates: RecipeDuplicate[] }`. 404 when there's no such recipe.
- **`GET /api/recipes/duplicates`** (`recipes` read, open to keys): `{ pairs: DuplicatePair[] }`.
- **`POST /api/recipes/{recipe}/duplicates/{other}/dismiss`** (`recipes` write, open to keys): 204.
  - 404 when either recipe isn't the household's, or is in Recently deleted.
  - 400 `same_recipe` when they're the same recipe.

Schemas, in `http/schemas/recipes.ts`:

- **`RecipeDuplicate`:** `{ id, slug, name, photo, sourceUrl, createdAt, reasons }`. `photo` is shaped as on a recipe card, or null.
- **`DuplicatePair`:** `{ recipes: [RecipeDuplicate, RecipeDuplicate], reasons }`. The older recipe comes first, and each side's `reasons` match the pair's.

`duplicates` joins the reserved slugs in `services/recipes/slugs.ts`, so no new recipe takes it. A recipe that already has that slug is still found by its id.

### Link imports

`findBySourceUrl` compares link keys rather than exact links. It loads the household's recipes that have a `sourceUrl` and returns the oldest whose key matches any of the links given. So a link import, a page from the extension and a video's own link give **You have this one** for the same page under another address. **Add it again** still forces a new recipe.

After the routes change: `pnpm --filter @merran/server openapi`, then the web and extension `api` scripts.

## Web

New words go in `apps/web/src/locales/en.json`, under `recipes.duplicates`.

### On a recipe

On the recipe page (`routes/_app/recipes/$slug/index.tsx`), when the recipe was added in the last 7 days and has duplicates, a notice shows under the header:

- One match: "You may have this one already: **{name}**", with **Open it** (to that recipe) and **Not the same** (dismisses the pair, and the notice goes).
- Several: "You may have these already:", then each name with its own **Open it** and **Not the same**.
- The reason shows after each name, as **Same link** or **Same name**.

It isn't shown on a recipe opened from a planned meal (with `meal` in its address), where the plan's notice comes first. The query runs only for recipes added in the last 7 days.

### Possible duplicates

A page at `/recipes/duplicates` (`routes/_app/recipes/duplicates.tsx`), linked as **Possible duplicates** from the Recipes page's **More** menu, next to **Recently deleted**:

- Each pair is a card with both recipes side by side: photo, name, the link's host when it has one, and when it was added. On a phone they stack.
- The reasons show above the two, as **Same link**, **Same name**, or both.
- Each recipe has **Open**. The pair has **Not the same**, which takes it off the list. Each recipe has **Delete**, which uses the app's existing delete confirmation (`DeleteRecipesDialog`, a drawer on phones) and its **Undo**, moving it to Recently deleted.
- With no pairs: "No possible duplicates. Recipes with the same link or the same name show here."

### In Review

Tidy up's proposal review (`features/recipes/tidy/proposal-review.tsx`) reads the recipe's duplicates and, when there are any, lists them under **Possible duplicates**. Each one links to its recipe, with its reason and **Not the same**. Being read live, a pair that's dismissed or deleted drops out.

## Errors

- Dismissing with a recipe that's gone, or another household's: 404.
- Dismissing a recipe against itself: 400 `same_recipe`.
- A link that can't be parsed has no link key, and can still match by name.

## Tests

Written first, each watched failing.

Shared (`packages/shared/src/recipes/duplicates.test.ts`):

- `linkKey`:
  - the four addresses above share a key
  - another page on the same site doesn't
  - a parameter other than tracking stays (`?p=12` and `?p=13` differ)
  - `ftp:` and non-links give null
- `nameWords`:
  - order, case, accents, filler and plurals ("Easy Lemon Chickens" and "the chicken with lemon")
  - "Recipe" alone is empty
  - `ss`, `us` and `is` endings stay ("Hummus", "Glass")
- `duplicateReasons`:
  - same link
  - same words
  - a name inside another with 3 of 4 foods shared, which matches
  - the same with 2 shared, which doesn't
  - the same with 3 shared out of 5, which doesn't (60%)
  - names with nothing in common
  - an empty word set, which never matches by name
  - both reasons, in order
- `findDuplicatePairs`:
  - each pair once
  - three copies give three pairs
  - a library with none gives none

Server, on SQLite and Postgres:

- `GET /api/recipes/{recipe}/duplicates` finds a same-link recipe and a same-name one, link first. It leaves out Recently deleted recipes and other households' recipes.
- `GET /api/recipes/duplicates` lists each pair once, newest first.
- Dismissing:
  - takes the pair out of both reads, for everyone in the household
  - saying it twice is fine
  - against itself is 400
  - with another household's recipe is 404
  - API keys need `recipes` write
- A recipe deleted for good takes its dismissals with it.
- A link import of `http://www.…/lemon-chicken/` after `https://…/lemon-chicken` gives the existing recipe with `duplicate: true`, and `force` still adds one.
- A new recipe can't take the slug `duplicates`.

## Docs

- `docs/features.md`: a row for possible duplicate recipes, and the link import row's note about the same page under another address.
- `docs/scope.md`, under Recipes: the row, and a dated line on what counts as a match and why there's no merging.
- `apps/docs/src/content/docs/docs/use/recipes.md`: the notice on a new recipe, the **Possible duplicates** page, and that **You have this one** now catches the same page under another address. Labels quoted exactly.
- The site's API reference is built from `openapi.json`.

## Credit

Commits that reuse ideas or code from the fork carry `Co-authored-by: bula87 <bula87@gmail.com>`.
