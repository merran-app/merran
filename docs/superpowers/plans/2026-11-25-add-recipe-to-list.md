# Add a Recipe to the List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put one recipe's ingredients on the shopping list in one step, from its page, a recipe card's right-click menu, or the List, without planning it on a day first.

**Architecture:** A new `POST /api/list/recipes` makes a plan entry in the household's current week's any-day pool and lists it with the existing `listMeals`, in one transaction. From then on it's an ordinary listed meal, so shares, the info popup, Covered at home, swaps and removal all work unchanged. Undo is the existing `DELETE /api/plan/entries/{entryId}`. On the web, one hook (`useAddRecipeToList`) is used by the recipe page's button, the card menu and a new List dialog.

**Tech Stack:** Hono + `@hono/zod-openapi`, MikroORM, Vitest (server). React, TanStack Query, react-i18next, sonner, Base UI through shadcn/ui (web).

**Spec:** [docs/superpowers/specs/2026-11-25-add-recipe-to-list-design.md](../specs/2026-11-25-add-recipe-to-list-design.md)

## Global Constraints

- Work in the worktree `D:\Development\Mise\.claude\worktrees\add-recipe-to-list`, on branch `feat/add-recipe-to-list`. Never touch the main checkout, which is on `fix/ios-long-swipe` with uncommitted work.
- Follow `AGENTS.md`:
  - Routes mirror the API.
  - Words people read go in `apps/web/src/locales/en.json`.
  - Use logical classes only (`ms-*`, `ps-*`, `text-start`), never `ml-*` or `pl-*`.
  - Phones use drawers. The app's `Dialog` already is one, so use it.
  - Comments are plain English and say why.
  - Code is readable, not packed.
- Every-week items don't come along. The plan entry is `anyDay: true`, dated the week's first day.
- The meal is the one given, else `"dinner"` if the household plans dinners, else its first planned meal.
- The permission is `list:write`.
- Focused server tests: `pnpm --filter @merran/server exec vitest run --project sqlite <path>`. Don't use `test -- <pattern>`, which runs everything.
- Use plain `pnpm`, not `corepack pnpm`.
- Regenerate the API files from PowerShell with `$env:pnpm_config_cache_dir = "D:\Development\Mise\.local\pnpm-cache"`, then `pnpm run api` in `apps/web` and in `apps/extension`. The two `schema.d.ts` files must match.
- Run Prettier from the root (`pnpm format`), never on `docs/`.

## Review Focus

1. **The household's week, not UTC's.** A household west of UTC late in the evening on its last day of the week must get its own week's pool, not the next one. Pinned by a test in Task 1 with a `Pacific/Honolulu` household.
2. **A household that doesn't plan dinners** gets its first planned meal, never a meal type it has turned off. Pinned in Task 1.
3. **The side and scaled servings shown on the recipe page** are what goes on the list. Lemon Chicken at 8 servings with Garlic Rice lists double chicken and the rice. Pinned in Task 1; Task 2 passes both through.
4. **Adding the same recipe twice** (a double tap, or two pies) makes two meals whose amounts add up, and Undo of the second takes off only its share. Pinned in Task 1, and Task 2 disables the button while saving.
5. **A recipe in Recently deleted** answers "No such recipe" (404) and puts nothing on the plan or the list. Pinned in Task 1.

---

### Task 1: The server route

**Files:**
- Modify: `apps/server/src/services/plan/plan.ts`: export `createEntry` (now module-private, about line 316).
- Create: `apps/server/src/services/list/recipe.ts`
- Modify: `apps/server/src/http/schemas/plan.ts`: export `MealSchema` and `servings`.
- Modify: `apps/server/src/http/schemas/list.ts`: add `RecipeToListSchema` and `RecipeListedSchema`.
- Create: `apps/server/src/http/routes/list/recipes/index.ts` and `post.ts`
- Modify: `apps/server/src/http/routes/list/index.ts`: register `recipesRoutes`.
- Modify: `apps/server/src/http/middleware/live.ts`: add `CHANGES` entry.
- Test: `apps/server/src/http/routes/list/recipes/recipes.test.ts`
- Regenerate: `apps/server/src/http/openapi/openapi.json`, `apps/web/src/lib/api/schema.d.ts`, `apps/extension/src/lib/schema.d.ts`

**Interfaces:**
- Produces (service, `services/list/recipe.ts`):
  ```ts
  export type RecipeToList = {
    recipe: string // id or address (slug), as the plan takes it
    withRecipe?: string | null
    servings?: number | null // null: the recipe's own
    meal?: Meal
  }
  export async function addRecipeToList(
    em: EntityManager,
    householdId: string,
    input: RecipeToList
  ): Promise<{
    entry: DescribedEntry
    added: number
    merged: number
    onHand: string[]
    inPantry: string[]
  }>
  ```
- Produces (HTTP):
  - `POST /api/list/recipes`, `operationId: "addRecipeToList"`, tag `List`, `...openToKeys("list", "write")`.
  - The body is `RecipeToListSchema` (`.openapi("RecipeToList")`, example `{ recipe: "lemon-chicken", withRecipe: "garlic-rice", servings: 8 }`).
  - 201 answers with `RecipeListedSchema` (`.openapi("RecipeListed")`): `{ entry: PlanEntrySchema, added, merged, onHand, inPantry }`, with the same field descriptions as `FromPlanResultSchema`.
  - 404 is "No such recipe." Spread `...SIGNED_IN_ERRORS`.
- Consumes:
  - `createEntry(em, householdId, input: NewEntry, weekStartsOn)` and `describeEntry` from `services/plan/plan.ts`;
  - `listMeals(em, householdId, entries)` from `services/list/meals.ts`;
  - `householdClock(em, householdId)` (`today`, `weekStartsOn`, `meals`);
  - `inHouseholdTransaction`.

- [ ] **Step 1: Set up the worktree.** Run `pnpm install` in the worktree root. Expected: no errors.

- [ ] **Step 2: Write the failing tests** in `recipes.test.ts`.
  - **Setup:** copy the setup of `apps/server/src/http/routes/list/list.test.ts`:
    - `createTestApp`, `setUpServer`;
    - a UTC household, `weekStartsOn: 1`, country `GB`;
    - the recipes Lemon Chicken (with `"1 tbsp olive oil"`, `"Salt to taste"`), Garlic Rice and Beef Tacos at 4 servings.
  - **Helpers:**
    - `add(body)` posts to `/api/list/recipes` and expects 201;
    - `list()` gets `/api/list` items;
    - `clearAll()` is as in `list.test.ts`.
  - **Tests**, each starting from `clearAll()`:
    - `"puts the recipe in this week's any-day meals, and its ingredients on the list"`: `add({ recipe: "lemon-chicken" })`.
      - The answer's `entry` matches `{ anyDay: true, meal: "dinner", date: weekStartOf(clockIn("UTC").today, 1), status: "planned" }`.
      - The answer has `added > 0`.
      - `list()` has `"chicken thighs"` with `meals` containing `{ id: entry.id }`.
      - `GET /api/plan?from=<week start>&to=<week start + 6>` includes the entry.
    - `"leaves off what's always on hand, and every-week items"`:
      - add an every-week item first (`POST /api/list/every-week { name: "Bananas" }`);
      - `add({ recipe: "lemon-chicken" })`;
      - `onHand` contains `"salt"`, and no list item is named `"salt"` or `"Bananas"`.
    - `"counts on what's at home"`:
      - `POST /api/pantry/items` with 2 lb chicken thighs;
      - `add(...)`;
      - `inPantry` contains `"chicken thighs"`, and no unchecked list line for chicken thighs.
    - `"adds the side and the servings asked for"`: `add({ recipe: "lemon-chicken", withRecipe: "garlic-rice", servings: 8 })`. The chicken thighs line is `quantity: 4, unit: "pound"`, and `"rice"` is on the list.
    - `"adds up with what's on the list already"`:
      - `POST /api/list/items { text: "1 lb chicken thighs" }`;
      - `add(...)`;
      - `merged >= 1`, and one chicken thighs line of 3 lb.
    - `"the same recipe twice is two meals, and Undo takes off only the second"`:
      - `add` twice;
      - chicken thighs is 4 lb;
      - `DELETE /api/plan/entries/<second id>`;
      - it's 2 lb, with `meals` = `[first id]`.
    - `"takes a meal type the household plans"`:
      - `PATCH /api/households/current { meals: ["breakfast", "lunch"] }`, then `add(...)`, and `entry.meal` is `"breakfast"`;
      - `add({ ..., meal: "lunch" })` gives `"lunch"`;
      - put meals back afterwards.
    - `"uses the household's week where it is"`: `PATCH { timeZone: "Pacific/Honolulu" }`, then `add(...)`. `entry.date` is `weekStartOf(clockIn("Pacific/Honolulu").today, 1)`. Put UTC back afterwards.
    - `"turns away a recipe that's gone"`:
      - `DELETE /api/recipes/beef-tacos` (into Recently deleted);
      - `POST /api/list/recipes { recipe: <tacos id> }` is 404 with `error.code` `"recipe_not_found"`;
      - the plan's week and the list are unchanged.
    - `"works with a key that can only write the list"`:
      - `POST /api/auth/api-keys { name: "List only", permissions: { list: "write" }, expiresInDays: 30 }`;
      - `app.request(.../api/list/recipes)` with `authorization: Bearer <key>` gets 201.

- [ ] **Step 3: Run them and watch them fail.**
  Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/list/recipes/recipes.test.ts`
  Expected: FAIL with 404s from `/api/list/recipes`.

- [ ] **Step 4: Export `createEntry`** from `plan.ts`, and `MealSchema` and `servings` from `schemas/plan.ts`. Write `addRecipeToList` in `services/list/recipe.ts`, in one `inHouseholdTransaction`:
  1. Read the clock.
  2. Pick the meal: `input.meal ?? (clock.meals.includes("dinner") ? "dinner" : clock.meals[0])`.
  3. Call `createEntry(tx, householdId, { date: clock.today, anyDay: true, meal, recipe, withRecipe, servings }, clock.weekStartsOn)`.
  4. `tx.flush()`.
  5. `listMeals(tx, householdId, [entry])`.
  6. Return `describeEntry(entry)` with the counts, without `meals`.

  Open the file with a comment saying it's a one-off, kept on the plan's any-day pool so the list can follow it like any meal. Then add the schemas, the route and the registration.
  - The route's description: "A recipe's ingredients on the list without planning a day for it: it goes in this week's any-day meals, and onto the list as Add from plan would put it, from then on following that meal. Every-week items don't come along."
  - In `live.ts`, before the general `/api/list` line, add `[/^\/api\/list\/recipes$/, ["list", "plan", "pantry"]]` with a comment that it puts a meal on the plan too.

- [ ] **Step 5: Run the tests and see them pass.** Run the Step 3 command. Expected: all pass. Then run `pnpm --filter @merran/server exec vitest run --project sqlite src/http/middleware/auth.test.ts src/http/routes/list` and expect all of them to pass. `auth.test.ts` picks the new route up and checks a bare key is turned away.

- [ ] **Step 6: Regenerate the API files.**
  1. Run `pnpm --filter @merran/server openapi`.
  2. In PowerShell, set `$env:pnpm_config_cache_dir` as in Global Constraints, then run `pnpm run api` in `apps/web` and `apps/extension`.
  3. Confirm that `openapi.json` gains `/api/list/recipes`.
  4. Confirm the two `schema.d.ts` files are identical (`git diff --no-index`).

- [ ] **Step 7: Typecheck, format and commit.**
  1. Run `pnpm typecheck` and `pnpm format`, then `pnpm format:check`. Expected: clean.
  2. Commit with the message "Add a recipe to the list without planning a day: POST /api/list/recipes puts it in the week's any-day meals and lists it", then the attribution line.

### Task 2: Add to list on a recipe

**Files:**
- Create: `apps/web/src/features/list/use-add-recipe.ts`
- Modify: `apps/web/src/routes/_app/recipes/$slug/index.tsx`: the button after **Plan it**, about line 456.
- Modify: `apps/web/src/features/recipes/recipe-menu.tsx`: the item under **Plan it**.
- Modify: `apps/web/src/locales/en.json`

**Interfaces:**
- Consumes: `POST /api/list/recipes` and `DELETE /api/plan/entries/{entryId}` through `api`/`unwrap` from `@/lib/api/client`.
- Produces:
  ```ts
  export function useAddRecipeToList(): {
    add: (input: {
      recipe: { id: string; name: string }
      withRecipe?: string | null
      servings?: number | null
    }) => Promise<boolean>
    busy: boolean
  }
  ```

- [ ] **Step 1: Write `useAddRecipeToList`.**
  - `add` posts and sets `busy` while it saves.
  - After the post, it invalidates `["list"]` and `["plan"]`, then shows `toast.success(t("list.recipe.added", { name }), { description: t("list.recipe.onPlan"), action: { label: t("list.undo"), onClick: undo } })`.
  - `undo` deletes the entry and invalidates the same keys again. A failed undo shows `toast.error(err.message)`.
  - An `ApiError` shows `toast.error(err.message)` and returns `false`, as `usePlanActions.attempt` does.
  - Name the undo handler; don't inline it.

- [ ] **Step 2: Add the words** to `en.json`:
  - `recipes.addToList`: "Add to list"
  - `list.recipe.added`: "Added {{name}} to the list."
  - `list.recipe.onPlan`: "It's on this week's plan, any day."

- [ ] **Step 3: Add the recipe page button.**
  - It's `size="lg"`, `variant="outline"`, after **Plan it**, with the HugeIcons `ShoppingBasketAdd01Icon`.
  - It's `disabled={busy}`, with a `Spinner data-icon="inline-start"` in place of the icon while busy.
  - It passes the same `servings` expression and `withRecipe: paired?.id ?? null` that `PlanItDialog` gets there.

- [ ] **Step 4: Add the card menu item.** **Add to list** goes right after **Plan it** in `RecipeMenu`, calling `add({ recipe })` with the recipe's own servings and no side.

- [ ] **Step 5: Verify.**
  1. Run `pnpm typecheck` and `pnpm --filter @merran/web check:locales`. Expected: clean.
  2. In the worktree's own servers (see "Verifying in the app" below), open Lemon Chicken, set 8 servings with its side, and press **Add to list**.
  3. Check the toast.
  4. Check the List: the lines are there, and a line's info popup names Lemon Chicken.
  5. Check the Plan: it's under **This week, any day**.
  6. Press **Undo** and check that both are gone.
  7. Right-click a card, choose **Add to list**, and check it's added.

- [ ] **Step 6: Format and commit.** Run `pnpm format`, then commit with the message "Add to list on a recipe's page and its card's right-click menu", then the attribution line.

### Task 3: Add a recipe from the List

**Files:**
- Create: `apps/web/src/features/list/add-recipe-dialog.tsx`
- Modify: `apps/web/src/features/list/list-page.tsx`: the header button beside **Add from plan** (about line 383), the empty list's button (about line 528), and the dialog next to `AddFromPlanDialog` (about line 769).
- Modify: `apps/web/src/locales/en.json`

**Interfaces:**
- Consumes: `useAddRecipeToList` from Task 2; `RecipePicker` from `@/features/recipes/recipe-picker` (`onPick`, `label`, `planDate`); `useHouseholdClock` from `@/features/plan/queries`; `Dialog*` from `@/components/ui/dialog`.
- Produces: `export function AddRecipeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void })`

- [ ] **Step 1: Write `AddRecipeDialog`.**
  - It uses the app's `Dialog`, which is a drawer on phones, `sm:max-w-md`, with the title `list.recipe.title`.
  - **Step one:** `RecipePicker` with `planDate={clock.today}` and `label={t("list.recipe.search")}`.
  - **Picking** shows step two:
    - the recipe's name;
    - a **Servings** number field (label `plan.servings`) holding `recipe.servings`, or empty when it has none;
    - `list.recipe.change` (a ghost button back to step one);
    - **Add to list** (`recipes.addToList`).
  - **Adding** passes `servings` only when it differs from the recipe's own, so an unchanged one stays `null`. On success it closes and resets to step one.
  - Closing the dialog resets it.

- [ ] **Step 2: Add the words:**
  - `list.recipe.button`: "Add a recipe"
  - `list.recipe.title`: "Add a recipe to the list"
  - `list.recipe.search`: "Find a recipe"
  - `list.recipe.change`: "Pick another"

- [ ] **Step 3: Add the List buttons.**
  - **Add a recipe** is `variant="outline"`, beside **Add from plan** in the header and in the empty list's message. Use the same icon as Task 2.
  - Check the header at 375px wide. If it wraps or overflows, hide the header button below `sm` and add a `DropdownMenuItem` for it to the header's ⋯ menu instead.

- [ ] **Step 4: Verify.**
  1. Run `pnpm typecheck`.
  2. In the worktree's servers, open **Add a recipe** on the List at desktop width: pick Garlic Rice, set servings to 8, and add it. Check the toast and the lines.
  3. Repeat at 375px. It opens as a drawer, and the header fits.
  4. Check that **Already planned** shows in the picker for a recipe on this week's plan.

- [ ] **Step 5: Format and commit.** Run `pnpm format`, then commit with the message "Add a recipe from the List", then the attribution line.

### Task 4: Keep everything current

**Files:**
- Modify: `docs/features.md`: a row under "Shopping and the pantry", after "A shopping list from the plan".
- Modify: `docs/shopping-and-planning-feedback.md`: a new section before "Before implementation of the planned improvements".
- Modify: `apps/docs/src/content/docs/docs/use/shopping-and-pantry.md`: under "Create a list from the plan".
- Modify: `apps/docs/src/content/docs/docs/use/recipes.md`: the right-click list at line 88, and wherever the recipe page's buttons are described (grep the guides for `**Plan it**`).

- [ ] **Step 1: Write the features row:** `| Add a recipe to the list without planning it | Key | Built | From a recipe's page or its card's right-click menu (**Add to list**), or **List → Add a recipe**: it goes in this week's any-day meals and its ingredients on the list as Add from plan would put them, with Undo ([decision](shopping-and-planning-feedback.md#add-a-recipe-to-the-list-without-planning-it)) |`

- [ ] **Step 2: Write the decision section** "## Add a recipe to the list without planning it".
  - Start with "Decided and built November 25, 2026."
  - Follow with five bullets from the spec:
    - why (the Thanksgiving pie);
    - approach 1 and why not 2 or 3;
    - the week, meal and every-week rules;
    - Undo and adding the same recipe twice;
    - `POST /api/list/recipes` with `list:write`.

- [ ] **Step 3: Update the guides.** Quote the labels exactly: **Add to list**, **Add a recipe**, **Pick another**, **This week, any day**. Say it shows on the plan, and that moving it to a day leaves the list as it is.

- [ ] **Step 4: Check and commit.**
  1. Run `pnpm docs:build`. Expected: it builds, with every link checked.
  2. Commit with the message "Describe adding a recipe to the list in the features, decisions and guides", then the attribution line.

## Verifying in the app

The user's `pnpm dev` runs the main checkout's code. To see this branch:

1. Run a test API and Vite from this worktree, as in the dev-household notes: API on a free port (try 3092) with `MERRAN_TELEMETRY=off` and a `node:sqlite` `backup()` copy of `apps/server/data/merran.db` (plus `secret` and `files/`) in the scratchpad, and Vite on 5192 proxying to it.
2. Serve it at `http://pr.localhost:5192`. Add the entries to the worktree's `.claude/launch.json`, call `preview_start` in the same message, then `git checkout -- .claude/launch.json`.
3. Sign in as Claude once, and touch only rows you made.
4. Afterwards, stop the servers and delete the scratch copy.
