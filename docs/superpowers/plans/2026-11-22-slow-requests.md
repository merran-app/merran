# The rest of the slow requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slice 4 of the speed work: **Work out nutrition**, **Make a photo** and **Check prices now** run as jobs that wait, then hand over; a receipt is read in a job; **Empty** and the other ways of deleting recipes for good leave their photos to a job; and a site recipe's photo is fetched when the site is read, not the first time someone looks.

**Architecture:** One helper, `waitThenHandOver` (`apps/server/src/services/jobs/hand-over.ts`), gives every "do it now" job slice 3's one-link behaviour: the request waits up to 10 seconds and answers as it does today, or answers 202 with the job and marks it handed over, so whoever started it hears when it ends. Each kind that does one thing for one recipe is keyed by that recipe, so a second press joins the first and the recipe says what's being worked on. A receipt is saved as "reading" with its uploads, and a job fills it in. Deleting recipes for good removes their rows in the request and queues a `files.remove` job for their photos.

**Tech Stack:** Hono with @hono/zod-openapi, MikroORM 7 (SQLite and Postgres), sharp, React 19 with TanStack Query 5, vitest (server), node:test (web).

**Branch:** `perf/slow-requests`, stacked on slice 3's `perf/imports` (#106). Rebase it once #106's CI fix lands, before Task 1.

**Spec:** [docs/performance.md](../../performance.md): slice 4's row in The plan, the rows of [Work still inside a request](../../performance.md#work-still-inside-a-request) for receipts, nutrition, photos, prices, Empty and site photos, and the decisions below.

## Decided before planning (November 22, 2026)

1. **Work out nutrition, Make a photo and Check prices now wait, then hand over.** The same as one link (decision 1): the request waits up to 10 s and answers as now if it's done; otherwise 202 with the job. The recipe page says "Working out nutrition…" or "Making a photo…" while it runs, after a reload too, and whoever started it gets a notice when it's done or didn't work.
2. **A receipt is read in a job, and the scan page holds on.** It's saved as "reading" and the scan page keeps showing Reading…, with the files still in memory, until the receipt is ready; then it opens it. If it was a recipe and you're still there, **Add it as a recipe** works as now. If you left, it's under Waiting receipts as "Reading…", with a notice when it's ready; one that turns out to be a recipe or no receipt says so there, with **Discard**.
3. **The share sheet and the assistant still read receipts in the request.** The share sheet must know receipt or recipe before it answers, and the assistant reads inside its streamed reply; each AI call already gives up after 90 s (slice 2). Moving the share sheet to a job is for later.
4. **Empty removes the rows at once and leaves the photos to a job.** So do **Delete for good**, deleting picked ones and the daily purge.

Already done: **text and photo imports have a time limit.** They call the AI through `useAi` (`services/recipes/import/ai-reader.ts`), which gives up after 90 s in a request since slice 2. Task 9 marks that row of the findings as fixed.

## Global Constraints

- The request waits **10 seconds** (`HANDOVER_MS`) before handing over, as one link does.
- A job started by someone carries who they are (`currentActor()` at enqueue, `withActor` in the job), so webhooks say they did it, not Merran.
- API changes: `pnpm --filter @merran/server openapi`, then `pnpm --filter @merran/web api` and `pnpm --filter @merran/extension api` (both `schema.d.ts` identical). The `api` scripts fail in Git Bash here: run them in PowerShell with `pnpm_config_cache_dir` in `.local/`. A route that can now answer 202 is a breaking change: the pull request's title is `feat!:`.
- Entity changes: `pnpm --filter @merran/server db:migration <name>` writes one for SQLite and one for Postgres. Adding a column must not rebuild a SQLite table (it would cascade-delete child rows); check the SQLite migration is `alter table … add column`.
- Routes mirror the API (`POST /api/recipes/{recipe}/nutrition` is `apps/server/src/http/routes/recipes/[recipe]/nutrition/post.ts`). Words people read go in `apps/web/src/locales/en.json`; a string whose meaning changes gets a new key.
- Comments are plain English and say why. Code is written for people to read: no packed one-liners. Logical classes only (`ms-*`, `text-start`); drawers, not dialogs, on mobile.
- Prettier from the root only (`pnpm format`), never on `docs/`.
- Focused tests: `pnpm --filter @merran/server exec vitest run --project sqlite <path>`; Postgres with `--project postgres --maxWorkers=2` on a busy machine.

## Review Focus

1. **A job that ends just as the request gives up.** The request has answered 202, so the person must still hear the job ended, and the page must not say "Working…" forever. `waitThenHandOver` marks the job handed over, then looks again: if it ended in between, it answers as done. Pinned in Task 1.
2. **Pressing it twice, or on two devices.** The second **Work out nutrition** or **Make a photo** for a recipe joins the job already going (its key), rather than paying for a second photo. Pinned in Tasks 2 and 3.
3. **Errors that were instant stay instant.** No servings, no ingredients, no USDA key or AI, a real photo already, photos off, no Kroger store: each still answers at once with its status (400, 409, 422), not as a job that fails later. Pinned in Tasks 2, 3 and 4.
4. **A receipt cut off by a restart.** Its job runs again at the next start and its uploads must still be there: they're removed only after the read is saved. Pinned in Task 5.
5. **Someone else's job.** A member who isn't a household admin can read a job they started (for the notice), and no one else's. Pinned in Task 1.

---

### Task 1: Wait, then hand over, for any job

**Files:**
- Create: `apps/server/src/services/jobs/hand-over.ts`, `apps/server/src/services/jobs/hand-over.test.ts`
- Modify: `apps/server/src/database/entities/jobs.ts` (`handedOverAt`), migration `job-handed-over`
- Modify: `apps/server/src/services/jobs/jobs.ts` (`describeJob`), `apps/server/src/http/schemas/jobs.ts` (`handedOver`), `apps/server/src/http/schemas/examples.ts` (`JOB`)
- Modify: `apps/server/src/http/routes/households/current/jobs/[jobId]/get.ts` (open to the job's starter)
- Modify: `apps/server/src/services/recipes/import/import-one.ts` (uses the shared pieces)
- Regenerate: `apps/server/openapi.json`, both `schema.d.ts`
- Test: `apps/server/src/http/routes/households/current/jobs/jobs.test.ts`

**Interfaces:**
- Produces:
  - `export const HANDOVER_MS = 10_000` (moved here from `import-one.ts`, which imports it).
  - `export type Failure = { error: { kind: AppErrorKind; code: string; message: string; fields?: Record<string, string> } }`
  - `export function failureOf(err: AppError): Failure`: what a job returns for an error the person should see, so a request still waiting can answer with it.
  - `export function throwIfFailure(result: unknown): void`: throws the `AppError` a `Failure` describes.
  - `export async function waitThenHandOver(em: EntityManager, jobs: JobRunner, jobId: string, options?: { ms?: number }): Promise<{ done: Record<string, unknown> | null } | { started: Job }>`. Done in time: its result, after `throwIfFailure`. Ended `failed`: throws `AppError("upstream", "job_failed", job.error ?? "That didn't work. Try again in a moment.")`. Ended `cancelled`: throws `AppError("conflict", "job_stopped", "It was stopped before it finished.")`. Not in time: sets `handedOverAt`, then reads the job again and treats one that ended meanwhile as ended in time.
  - `Job.handedOverAt: Date | null`; `JobSchema.handedOver: boolean` ("A request waiting for it gave up and left it to run in the background, so whoever started it hears when it ends.").

- [ ] **Step 1: Write the failing tests**

`hand-over.test.ts`, with a runner and test handlers as `runner.test.ts` builds them:

```ts
test("a job done in time answers with what it returned", async () => {
  // handler returns { recipeId: "r1" } at once
  // expect(await waitThenHandOver(em, jobs, job.id)).toEqual({ done: { recipeId: "r1" } })
})

test("a job that returns a failure throws its error, with its status", async () => {
  // handler returns failureOf(new AppError("unprocessable", "no_key", "No key."))
  // await expect(...).rejects.toMatchObject({ kind: "unprocessable", code: "no_key" })
})

test("a job still going is handed over and marked so", async () => {
  // handler waits on a promise; { ms: 50 }
  // expect(result).toMatchObject({ started: { id: job.id } })
  // expect((await em.findOneOrFail(Job, job.id)).handedOverAt).not.toBeNull()
})

test("a job that ends as the wait runs out answers as done", async () => {
  // handler resolves right after the 50 ms wait; the look after marking it finds it done
  // expect(result).toEqual({ done: { ... } })
})
```

`jobs.test.ts`:

```ts
test("a member who started a job can see it, and not anyone else's", async () => {
  // a non-admin member's job (createdBy them) → 200 with handedOver: false
  // another member's job → 404, as for a job in another household
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/jobs/hand-over.test.ts src/http/routes/households/current/jobs`
Expected: FAIL: `hand-over.ts` doesn't exist; the member gets 403.

- [ ] **Step 3: Implement**

- `jobs.ts` entity: `handedOverAt: p.datetime().nullable()`, like `finishedAt`. Run `pnpm --filter @merran/server db:migration job-handed-over` and check the SQLite one only adds a column.
- `hand-over.ts` as above; its opening comment says why: every "do it now" job answers like one link (decision 1), and the starter hears about one that went to the background.
- The `[jobId]` route: `inHousehold(c)`, then 404 unless the person is a household admin (`isAdminRole(role)`) or `job.createdBy?.id === userId`. Description: "Household admins, and whoever started it. How a job for this household, like an import, is getting on."
- `import-one.ts` keeps its own `Outcome`, but builds its error part with `failureOf` and rethrows with `throwIfFailure`; `HANDOVER_MS` comes from `hand-over.ts`.
- Run `pnpm --filter @merran/server openapi` and both `api` scripts.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/jobs src/http/routes/households src/http/routes/recipes/import`
Expected: PASS, slice 3's one-link tests included.

- [ ] **Step 5: Commit**

`git commit -m "Wait for any job, then hand it over, and let its starter see it"`

---

### Task 2: Work out nutrition as a job

**Files:**
- Modify: `apps/server/src/services/nutrition/nutrition.ts` (`checkNutritionPossible`, used by `workOutNutrition` too)
- Modify: `apps/server/src/services/nutrition/runs.ts` (`workOutNutritionJob`, `startNutritionNow`)
- Modify: `apps/server/src/services/jobs/handlers.ts`
- Create: `apps/server/src/services/recipes/working.ts` (`workingOn`)
- Modify: `apps/server/src/services/recipes/recipes.ts` (`loadRecipe` adds `working`), `apps/server/src/http/schemas/recipes.ts` (`working` on `RecipeSchema`)
- Modify: `apps/server/src/http/routes/recipes/[recipe]/nutrition/post.ts` (200 or 202)
- Regenerate: `apps/server/openapi.json`, both `schema.d.ts`
- Test: `apps/server/src/services/nutrition/now.test.ts` (new: the hand-over, as `import-one.test.ts` tests it), `apps/server/src/http/routes/recipes/nutrition/nutrition.test.ts` (the route's 200 and its errors)

**Interfaces:**
- Consumes: Task 1's `waitThenHandOver`, `failureOf`.
- Produces:
  - `checkNutritionPossible(deps, em, { householdId, recipe }): Promise<void>`: the checks `workOutNutrition` makes before it starts (no servings 400, no ingredients 400, no USDA key and no AI 422), unchanged.
  - Kind `recipes.workOutNutrition`, key `recipes.workOutNutrition:<recipeId>`, payload `{ recipeId: string, userId: string | null, actor: Actor }`, `maxAttempts: 1`, `lane: "long"`, `area: "recipes"`, `changes: ["recipes"]`, `concurrency: 3`, `perHousehold: 2`. Returns `{ recipeId, name }`, or `{ ...failureOf(err), recipeId, name }` for an `AppError`.
  - `workOutNutritionNow(deps, em, { householdId, userId, recipe }, options?: { handoverMs?: number }): Promise<{ done: LoadedRecipe } | { started: Job }>` (`LoadedRecipe = Awaited<ReturnType<typeof loadRecipe>>`, exported from `recipes.ts`): `checkNutritionPossible`, then `enqueue` with the key (a second press gets the job already going), then `waitThenHandOver`. `handoverMs` is for tests, as `importOne`'s is.
  - `workingOn(em, recipeId): Promise<("nutrition" | "photo")[]>`: which of the recipe's keyed jobs are queued or running (Task 3 adds the photo's key).
  - `RecipeSchema.working`: `z.array(z.enum(["nutrition", "photo"]))`, described "What Merran is doing for it in the background: working out its nutrition, making its photo."
  - `POST /recipes/{recipe}/nutrition`: 200 with the recipe as now; 202 with `JobSchema` ("Still working it out: the recipe has it once this job is done.").

- [ ] **Step 1: Write the failing tests**

`now.test.ts`:

```ts
test("nutrition that takes longer hands over, and the recipe says it's being worked out", async () => {
  // a fake USDA held until released; workOutNutritionNow(..., { handoverMs: 50 })
  // → { started: job }; loadRecipe → working toEqual(["nutrition"]);
  // release; drain → nutrition set, working toEqual([])
})

test("pressing it again while it's going joins the same job", ...)
// two calls while held → both { started } with the same job id
```

`nutrition.test.ts`:

```ts
test("nutrition worked out within the wait answers with the recipe, as before", ...)
// fake USDA answering at once → 200, body.nutrition set, body.working toEqual([])

test("no servings still answers at once", ...)
// → 400 no_servings, and no job made
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/nutrition src/http/routes/recipes/nutrition`
Expected: FAIL: `workOutNutritionNow` doesn't exist; no `working`.

- [ ] **Step 3: Implement**

- `checkNutritionPossible` holds the first checks of `workOutNutrition`, which now calls it.
- The route calls `workOutNutritionNow`: done → 200 with the recipe; started → 202 with `describeJob`. Description adds "It waits up to 10 seconds; past that it answers 202 with the job, and the recipe has it once the job's done."
- The handler runs `workOutNutrition` inside `withActor(payload.actor, …)`; an `AppError` (USDA's hourly limit, the AI's) is returned with `failureOf` so the waiting request answers with it, as before.
- `loadRecipe` adds `working: await workingOn(em, recipe.id)` (one query on `jobs.key`, which has an index). `describeRecipe` stays synchronous, with `working: []`; the two other callers (versions and variants) never answer with a full recipe a page keeps.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/recipes src/services/nutrition`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "Work out a recipe's nutrition in a job, handing over after 10 seconds"`

---

### Task 3: Make a photo as a job

**Files:**
- Modify: `apps/server/src/services/recipes/photos/generate.ts` (`checkPhotoPossible`, used by `makePhoto` too)
- Modify: `apps/server/src/services/recipes/photos/runs.ts` (`makePhotoJob`, `startPhotoNow`)
- Modify: `apps/server/src/services/jobs/handlers.ts`, `apps/server/src/services/recipes/working.ts`
- Modify: `apps/server/src/http/routes/recipes/[recipe]/photo/make/post.ts`
- Regenerate: `apps/server/openapi.json`, both `schema.d.ts`
- Test: `apps/server/src/http/routes/recipes/photos/photos.test.ts`

**Interfaces:**
- Consumes: Task 1; Task 2's `workingOn` and `working`.
- Produces:
  - `checkPhotoPossible(deps, em, { householdId, recipe }): Promise<void>`: photos off (422 `photos_off`), a real photo (409 `has_photo`), no key (422 `photos_no_key`).
  - Kind `recipes.makePhoto`, key `recipes.makePhoto:<recipeId>`, payload `{ recipeId, userId, actor }`, `maxAttempts: 1`, `lane: "long"`, `area: "recipes"`, `changes: ["recipes"]`, `concurrency: 2`, `perHousehold: 1`. Returns `{ recipeId, name }` or with `failureOf`.
  - `makePhotoNow(deps, em, { householdId, userId, recipe }, options?: { handoverMs?: number }): Promise<{ done: LoadedRecipe } | { started: Job }>`, as `workOutNutritionNow`.
  - `POST /recipes/{recipe}/photo/make`: 200 with the recipe; 202 with `JobSchema`.

- [ ] **Step 1: Write the failing tests**

In a new `apps/server/src/services/recipes/photos/now.test.ts`, with `handoverMs: 50` and the fake `media.image` held:

```ts
test("a photo that takes longer hands over, and the recipe says it's being made", ...)
// working toEqual(["photo"]) until it's done
test("pressing it twice makes one photo", ...)
// two calls while held → same job; one image made
```

In `photos.test.ts`:

```ts
test("a photo made within the wait answers with the recipe", ...)
test("a recipe with a real photo still answers 409 at once", ...)
test("the photo's webhook says who asked for it", ...)
// recipe.updated with parts ["photo"], by the person, via "app"
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/recipes/photos src/http/routes/recipes/photos`
Expected: FAIL.

- [ ] **Step 3: Implement** as Task 2: the route calls `makePhotoNow`. The handler runs `makePhoto` and then `recordParts(em, householdId, recipe, ["photo"])` (moved from the route) inside `withActor(payload.actor, …)`. `workingOn` adds the photo's key. Run `openapi` and both `api` scripts.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/recipes src/services/recipes/photos`
Expected: PASS, the restart test that broke CI on slice 3 included.

- [ ] **Step 5: Commit**

`git commit -m "Make a recipe's photo in a job, handing over after 10 seconds"`

---

### Task 4: Check prices now as a job

**Files:**
- Modify: `apps/server/src/services/stores/prices.ts` (`checkPricesNow`, the job's `now` payload)
- Modify: `apps/server/src/http/routes/stores/kroger/prices/post.ts`
- Modify: `apps/server/src/http/schemas/stores.ts` (`checkingPrices` on `StoresStatusSchema.kroger`) and the service that fills it
- Regenerate: `apps/server/openapi.json`, both `schema.d.ts`
- Test: the Kroger prices route's tests (`apps/server/src/http/routes/stores/`)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `checkPricesNow(deps, em, { householdId, userId }, options?: { handoverMs?: number }): Promise<{ done: PriceCheck } | { started: Job }>`: checks Kroger is set up with a store (422 now, as `checkPrices` does), then `enqueue`s `stores.prices` with its existing key `stores.prices:<householdId>`, payload `{ now: true, userId, actor }`, `createdBy`, then `waitThenHandOver`. A check already waiting from the half-hourly look is joined.
  - The `stores.prices` handler, when `now`, returns `failureOf(err)` for an `AppError` (Kroger's daily limit 429, no answer 502) instead of throwing.
  - `StoresStatusSchema.kroger.checkingPrices: boolean` ("A price check is going now.").
  - `POST /stores/kroger/prices`: 200 with `PriceCheckSchema`; 202 with `JobSchema`.

- [ ] **Step 1: Write the failing tests**

```ts
test("a check done within the wait answers with what it found, as before", ...)
test("no store picked still answers 422 at once", ...)
test("Kroger's daily limit, met in the job, answers 429 to the waiting request", ...)
```

and, calling `checkPricesNow` with `handoverMs: 50` and the fake Kroger held (in `apps/server/src/services/stores/prices.test.ts`, or a new `now.test.ts` beside it):

```ts
test("a longer check hands over, and the stores say it's checking", ...)
// the stores status → kroger.checkingPrices true until it's done
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/stores src/services/stores`
Expected: FAIL.

- [ ] **Step 3: Implement**, then `openapi` and both `api` scripts. `checkingPrices` is an `enqueue`-style look for an active job with the household's key.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/stores src/services/stores`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "Check prices now in a job, handing over after 10 seconds"`

---

### Task 5: Receipts read in a job

**Files:**
- Modify: `apps/server/src/database/entities/receipts.ts` (`status`, `error`), migration `receipt-status`
- Modify: `apps/server/src/services/pantry/receipts/receipts.ts` (split reading from saving; `startReceipt`; `readReceiptJob`)
- Modify: `apps/server/src/services/jobs/handlers.ts`
- Modify: `apps/server/src/http/routes/pantry/receipts/post.ts` (201 or 202), `apps/server/src/http/schemas/receipts.ts` (`status`, `error`)
- Regenerate: `apps/server/openapi.json`, both `schema.d.ts`
- Test: the receipts route tests (`apps/server/src/http/routes/pantry/receipts/`)

**Interfaces:**
- Consumes: Task 1's `waitThenHandOver`.
- Produces:
  - `RECEIPT_STATUSES = ["reading", "ready", "recipe", "none", "failed"] as const`; `Receipt.status` (default `"ready"`, so receipts read before this release stay as they are) and `Receipt.error: string | null`. `recipe`: it was a recipe, not a receipt; `none`: no receipt in it; `failed`: it couldn't be read, `error` says why.
  - `readLines(em, deps, { householdId, userId, input }): Promise<{ what: "receipt" | "recipe" | "other"; read: { store; date; total; lines: ReceiptLine[]; kept: { body: Buffer; mediaType }[] } | null }>`: everything `readReceipt` does today except saving.
  - `readReceipt` (the share sheet's and the assistant's) keeps its signature and behaviour on top of `readLines`: it saves only a receipt, as `ready`.
  - `scanReceipt(em, deps, { householdId, userId, input }, options?: { handoverMs?: number }): Promise<{ done: ReceiptView } | { started: ReceiptView }>`: the quick checks (at least one file or text, at most `MAX_RECEIPT_FILES`, a PDF under 10 MB), then a `reading` receipt with no lines, its uploads at `receipts/<household>/<receipt>/upload/<index>` (the text in the payload), and the job, then `waitThenHandOver`. A `recipe` or `none` within the wait is removed and thrown as the 422 it is now.
  - Kind `pantry.readReceipt`, payload `{ receiptId, userId, actor, text: string | null, types: string[] }`, `maxAttempts: 1`, `lane: "long"`, `area: "pantry"`, `changes: ["pantry"]`, `concurrency: 2`, `perHousehold: 2`. It reads the uploads, runs `readLines`, saves the lines and kept files with `ready`, or sets `recipe`, `none`, or `failed` with the `AppError`'s message, and removes the uploads only after that's saved. Returns `{ receiptId, store, lines, status }`.
  - `ReceiptSchema.status`, `ReceiptSchema.error`. `POST /pantry/receipts`: 201 with the receipt (`ready`) as now; 202 with the receipt (`reading`). A receipt found to be a recipe within the wait still answers 422 `receipt_is_recipe`, and none 422 `not_a_receipt`, and isn't kept.
  - `findReceipt` for **Add** only finds `ready` receipts; `listReceipts` lists every status, newest first.

- [ ] **Step 1: Write the failing tests**

Route tests:

```ts
test("a receipt read within the wait answers 201, ready, as before", ...)
test("too many files still answers 400 at once", ...)
```

Service tests (`apps/server/src/services/pantry/receipts/scan.test.ts`, new), calling `scanReceipt` with `handoverMs: 50` and the fake model held:

```ts
test("a receipt that takes longer starts reading, and is ready once the job's done", async () => {
  // → { started } with status "reading", lines []; listReceipts has it reading;
  // release; drain → status "ready", lines from the fake
})
test("a recipe found after the wait says so on the receipt", ...)
// → status "recipe", lines [], and Add answers receipt_not_found
test("a receipt cut off by a restart is read at the next start", async () => {
  // stop the runner while the fake model holds it; a new runner reads it from the uploads
  // → status "ready"; the upload folder is gone afterwards
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/pantry src/services/pantry src/services/share src/services/assistant`
Expected: FAIL: always 201 after the whole read; no `status`.

- [ ] **Step 3: Implement**

- Entity and migration (`pnpm --filter @merran/server db:migration receipt-status`; add columns only).
- `receipts.ts` as above. `forgetOld` also removes a forgotten receipt's uploads (they share its folder).
- The route calls `scanReceipt`: done → 201; started → 202 with the reading receipt. Description says it may answer 202 while it's read.
- Run `openapi` and both `api` scripts.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/pantry src/services/pantry src/services/share src/services/assistant`
Expected: PASS: the share sheet and the assistant read as before.

- [ ] **Step 5: Commit**

`git commit -m "Read a scanned receipt in a job, handing over after 10 seconds"`

---

### Task 6: Photos of recipes deleted for good, removed by a job

**Files:**
- Create: `apps/server/src/services/storage/remove-job.ts` (`removeFilesJob`, `removeFilesLater`)
- Modify: `apps/server/src/services/recipes/deleted.ts` (`deleteRecipes`)
- Modify: `apps/server/src/services/jobs/handlers.ts`
- Test: `apps/server/src/http/routes/recipes/deleted/bulk/bulk.test.ts`, and a test for Empty beside it

**Interfaces:**
- Produces: kind `files.remove`, payload `{ paths: string[] }` (what `files.remove` takes, as `removePhoto` builds it), `lane: "long"`, `concurrency: 1`, no household limit, `maxAttempts: 3`; it stops between files when stopped. `removeFilesLater(em, householdId, paths): Job | null`: a job made with `createJob`, saved by the caller's flush, or null for no paths.

- [ ] **Step 1: Write the failing tests**

```ts
test("Empty deletes the recipes at once and leaves their photos to a job", async () => {
  // two deleted recipes with photos; a file store whose remove is held
  // DELETE /recipes/deleted → 204 before any file is removed; GET deleted → []
  // drain → both photo folders gone
})
test("Delete for good and picked ones leave their photos to the job too", ...)
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/recipes/deleted`
Expected: FAIL: the request waits for every file.

- [ ] **Step 3: Implement.** `deleteRecipes` removes the recipes and, in the same flush, `removeFilesLater` with their photo folders, then `wakeRunner()`; `pruneTags` as now. The daily purge goes through `deleteRecipes`, so it queues the same job.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/recipes src/services/recipes`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "Remove the photos of recipes deleted for good in a job"`

---

### Task 7: Site photos fetched when the site's read

**Files:**
- Modify: `apps/server/src/services/recipes/discover/sites/shelf.ts` (`readSite`, `keepShelfPhoto`)
- Modify: `apps/server/src/services/recipes/discover/sites/read-job.ts` (the classics' opener)
- Modify: `apps/server/src/http/routes/sites/recipes/[recipe]/photo/get.ts` (description only)
- Test: `apps/server/src/services/recipes/discover/sites/sites.test.ts`

**Interfaces:**
- Produces: `keepShelfPhoto(deps, em, row): Promise<void>`: fetches and keeps a row's photo if it has a `photoUrl` and none kept yet, as `shelfPhoto` does, without reading it back. `shelfPhoto` uses it. `PHOTOS_EACH_READ = 6`: rows with a `photoUrl` and no photo yet, filled in at the end of each read.

- [ ] **Step 1: Write the failing tests**

```ts
test("a post that opens as a recipe has its photo kept as the site's read", ...)
// fake site with one post and its photo → after readSite, row.photo is set and the file exists
test("each read fills in a few older recipes' photos", ...)
// 8 rows with photoUrl and photo null → after one read, 6 have photos
test("a photo that won't load doesn't stop the read", ...)
// photo answers 404 → row.photo === "", the read goes on
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/recipes/discover/sites`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `readSite`, after a page opens as a recipe and is saved, `keepShelfPhoto`; after the posts, up to `PHOTOS_EACH_READ` older rows of the site. The classics' opener does the same for each classic that opens. The photo route stays for rows still without one; its description says photos are fetched as sites are read, and here only when one wasn't yet.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/recipes/discover src/http/routes/sites`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "Fetch a site recipe's photo when the site is read"`

---

### Task 8: The web app follows these jobs and says when they're done

**Files:**
- Modify: `apps/web/src/features/recipes/nutrition-section.tsx`, `apps/web/src/features/recipes/recipe-photo.tsx`, `apps/web/src/features/stores/stores-card.tsx`, `apps/web/src/routes/_app/recipes/deleted.tsx` (no change to how Empty answers; check its toast still fits)
- Create: `apps/web/src/features/jobs/notices.ts`, `apps/web/src/features/jobs/notices.test.ts`, `apps/web/src/features/jobs/use-job-notice.ts`
- Modify: `apps/web/src/features/live/live-updates.tsx` (the new notices beside the import ones), `apps/web/src/features/live/jobs.ts` (`JOB_REFRESH`), `apps/web/src/features/live/jobs.test.ts`
- Modify: `apps/web/src/locales/en.json`, `apps/web/package.json` (test list)

**Interfaces:**
- Consumes: the 202 answers of Tasks 2–4, `Recipe.working`, `StoresStatus.kroger.checkingPrices`, `Job.handedOver`, `GET /households/current/jobs/{jobId}` (Task 1), the live `job` event's `startedBy`.
- Produces: `NOW_JOB_KINDS` (`recipes.workOutNutrition`, `recipes.makePhoto`, `stores.prices`, `pantry.readReceipt`); `jobNoticeFor(job: JobMoved, meId: string): boolean` (one of those, ended done or failed, started by them); `jobNoticeMessage(job: { kind; status; handedOver; result; error }): JobNoticeMessage | null` (null when it wasn't handed over: they saw it finish). `JOB_REFRESH` gains `stores.prices` → `[["stores"]]` and `pantry.readReceipt` → `[["pantry", "receipts"]]`; nutrition and photos refresh through their `changes`.

- [ ] **Step 1: Write the failing tests**

`notices.test.ts`:

```ts
test("only the starter hears, and only of one that ended on its own", () => {
  assert.equal(jobNoticeFor({ ...nutrition, status: "done", startedBy: "me" }, "me"), true)
  assert.equal(jobNoticeFor({ ...nutrition, status: "cancelled", startedBy: "me" }, "me"), false)
  assert.equal(jobNoticeFor({ ...nutrition, status: "done", startedBy: "them" }, "me"), false)
})

test("what each says", () => {
  assert.deepEqual(jobNoticeMessage({ kind: "recipes.workOutNutrition", status: "done", handedOver: true, result: { recipeId: "r", name: "Lemon Chicken" }, error: null }),
    { key: "jobs.notice.nutrition", values: { name: "Lemon Chicken" } })
  // a result with error → { key: "jobs.notice.nutritionFailed", values: { name, why: message } }
  // a photo → jobs.notice.photo / photoFailed; prices → jobs.notice.prices { count: deals } / pricesFailed { why }
  // a receipt → jobs.notice.receipt { store } (or receiptNoStore), receiptNot when status recipe or none
  // handedOver false → null
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @merran/web test`
Expected: FAIL: `features/jobs/notices.ts` doesn't exist.

- [ ] **Step 3: Implement**

- **Nutrition and photo:** a 200 does as now. A 202 puts the job's kind into the recipe's `working` in the query cache, so the button shows its spinner and "Working out nutrition…" (`recipes.nutrition.working`) or "Making a photo…" (`recipes.photo.making`) shows where the result will go. Both show whenever `recipe.working` has them, after a reload too; the recipe refetches when the job's `changes` arrive, and `working` empties.
- **Prices:** a 202 sets `checkingPrices`, and the button says "Checking prices…" (`settings.household.stores.checkingNow`) while it's true.
- **Notices:** `useJobNotice` fetches the job and, when `jobNoticeMessage` gives words, toasts them with **View** (the recipe, the stores settings, or the receipt). English: "Lemon Chicken's nutrition is worked out." / "Couldn't work out Lemon Chicken's nutrition. {why}" / "Lemon Chicken has a new photo." / "Couldn't make a photo for Lemon Chicken. {why}" / "Prices checked: {count} deals." / "Couldn't check prices. {why}" / "Your receipt from {store} is ready to look over." / "Your receipt is ready to look over." / "That wasn't a receipt Merran could read."

- [ ] **Step 4: Run the tests and the checks**

Run: `pnpm --filter @merran/web test`, `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: See it in a browser.** On this branch's test server (`.claude/launch.json`), in the dev household as the Claude admin account: with a fake slow USDA or no key cached, press **Work out nutrition** on a recipe; past 10 s the section says "Working out nutrition…", survives a reload, and the notice comes when it's done. Press **Make a photo** twice quickly: one job. Screenshot both.

- [ ] **Step 6: Commit**

`git commit -m "Follow nutrition, photo and price jobs in the app, with a notice when one's done"`

---

### Task 9: The scan page holds on while a receipt's read

**Files:**
- Modify: `apps/web/src/features/pantry/receipts/scan-page.tsx`, `receipt-page.tsx`, `waiting-receipts.tsx`, `queries.ts`
- Modify: `apps/web/src/locales/en.json`

**Interfaces:**
- Consumes: Task 5's 201/202 answers and `Receipt.status`/`error`; Task 8's notices and `JOB_REFRESH`.

- [ ] **Step 1: Implement**

- `scan-page.tsx`: a 201 opens the receipt as now. A 202 keeps the Reading… view, with the sent files kept, and follows `receiptQuery(id)` (refreshed by the job event, polling with `followEvery(2000)` as a fallback) until its status isn't `reading`: `ready` opens it; `recipe` shows the existing "That looks like a recipe" with **Add it as a recipe** from the kept files; `none` and `failed` show their message, as a 422 does now.
- `waiting-receipts.tsx`: a `reading` receipt says "Reading…" with a spinner (`pantry.receipts.readingOne`) and isn't a link to look over; `recipe`, `none` and `failed` say why (`pantry.receipts.wasRecipe`, `pantry.receipts.noneFound`, the `error`) with **Discard**.
- `receipt-page.tsx`: opened on a receipt that isn't `ready` (from a notice or a link), it shows the same as the waiting list.

- [ ] **Step 2: Run the checks**

Run: `pnpm --filter @merran/web test`, `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: See it in a browser.** With a model fake or a slow provider, scan a receipt photo; past 10 s the page still says Reading…, then opens the receipt. Scan again and leave for the pantry: Waiting receipts says Reading…, then the notice comes. Screenshot both.

- [ ] **Step 4: Commit**

`git commit -m "Hold on while a receipt's read, and show receipts still being read"`

---

### Task 10: Docs, and the whole check

**Files:**
- Modify: `docs/performance.md`: "What slice 4 built" (dated as built) with what was decided while building it; the rows of Work still inside a request for receipts, nutrition, photos and prices, Empty, site photos, and text and photo imports marked as fixed; slice 4's row in The plan; the header's paragraph.
- Modify: `docs/platform.md` (Jobs: the new kinds, waiting then handing over, the starter seeing their job), `docs/features.md` (nutrition, AI photos, receipts, Kroger prices, Recently deleted: what changed; "Background jobs that survive restarts": slice 4).
- Modify guides, quoting the app's labels exactly: `apps/docs/src/content/docs/docs/use/recipes.md` (Work out nutrition, Make a photo, Empty), `use/shopping-and-pantry.md` (scanning a receipt, Waiting receipts), `integrations/kroger.md` (Check prices now).

- [ ] **Step 1: Write the docs**, dated the day it's built.
- [ ] **Step 2: Run the whole check**

Run: `pnpm typecheck`, `pnpm format:check`, `pnpm --filter @merran/server test:all` (Postgres too: `db:test-postgres` first), `pnpm --filter @merran/web test`, `pnpm --filter @merran/shared test`, `pnpm docs:build`, and confirm `apps/web/src/lib/api/schema.d.ts` and `apps/extension/src/lib/schema.d.ts` are identical.
Expected: all pass.

- [ ] **Step 3: Commit**

`git commit -m "Note slice 4 as built"`
