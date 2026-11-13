# More webhook events (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every slice 1 event in the spec is sent by the change that causes it: imports, tidy-up, Review, the plan, meals made and skipped, the list, store carts and the pantry. Plan, list and pantry changes are gathered for 30 seconds into one event with exact counts.

**Architecture:** Each feature calls PR 1's `record()` with the entity manager of the change, before that change's own flush. For the three gathered events, `record()` saves a small row marked `gathered` and queues one keyed job per household and type, 30 seconds out. That job merges the household's unmerged rows of that type into one event per person, then sends it through the normal path (a delivery and a `webhooks.deliver` job per webhook). Plan, list and Review changes come from many functions, so small helpers work out the counts from what each function already has: before and after snapshots, claimed rows, its totals.

**Tech Stack:** Hono + @hono/zod-openapi (`registry.registerWebhook`), MikroORM 7 (SQLite and Postgres), vitest, React + TanStack Query, WXT (the extension), Astro Starlight.

**Spec:** [docs/webhooks.md](../../webhooks.md): "Events" → slice 1, "Gathering", "Data" and "Build order" item 2. Read it first. This plan argues from it. PR 1's plan, [2026-11-10-webhooks.md](2026-11-10-webhooks.md), says how the engine was built.

**Where:** branch `feat/webhook-events`, from `feat/webhooks`, in the worktree `.claude/worktrees/webhook-events`. The pull request's base is `feat/webhooks` (merran-app/merran#95), titled `feat: more webhook events`.

**PR 1 is still moving.** Its session is adding follow-ups to `feat/webhooks`: refusing link-local addresses, the `Expect` header, resending a test that's still in progress, no events from setters that change nothing, picker descriptions, and a guide note. Rebase onto it (`git rebase feat/webhooks`) before Task 1 and again before Task 12. If picker descriptions have landed by Task 1, give each new event one in the same shape (copy below).

## Decisions this plan makes

The spec leaves these open. The user confirms them when reviewing this plan. Task 11 records them, with the date, in `docs/webhooks.md`.

1. **Gathered events are merged per person.** A window gives one event for each who (`by`, `via`, `key`), so `by` stays exact, and an n8n flow can still ignore the change it caused. One person checking off 30 things still makes one event.
2. **A change made while the merge job runs re-arms that job,** 30 seconds on. The runner already supports this: a job started over while it runs goes back in the queue (`runner.test.ts`, "a job started over while it runs runs again from its first try"). The merge job runs one at a time across the server (`concurrency: 1`), so two merges never take the same rows.
3. **The gathered events also count `changed`:** a meal's recipe, side, note or servings; a list item's name, amount, aisle or list; a pantry item's amount, name or use-by. Without it, swapping tonight's dish or fixing an amount would send nothing.
   - Reordering a meal's dishes counts as `moved`.
   - Marking meals made or Didn't isn't a plan change: it's `meal.cooked` and `meal.skipped`.
4. **`plan.changed` covers every add, move and removal, whatever did it:** the autoplan (alongside `plan.autoplanned`), applying a proposal, Repeat last week, Clear, Undo, and Made it when it adds a meal or moves one from the pool (alongside `meal.cooked`).
5. **Undo restores, it doesn't redo.** Putting meals back sends `plan.changed` but never `meal.cooked` or `meal.skipped` again. Setting a meal back to planned sends nothing. Undo on the list sends `list.changed` but never `list.completed`.
6. **`meal.cooked` and `meal.skipped` are in the Plan area** of the picker. Cooking, its own area, arrives with PR 3's sessions and timers.
7. **What ends a shopping trip.** `list.completed` is sent when the last unchecked item on a list is checked off, however that's done (except Undo). It's also sent when **Put away** (`POST /api/list/put-away`) clears a list that still has unchecked items. A list that was finished already gets nothing more when it's put away, so one trip sends one. **Clear checked** isn't the end of a trip.
8. **Imports that fail or stop send nothing.** `import.finished` is sent when an import runs to its end. One that fails as a whole, or is stopped, shows on its page and in Jobs. Archive imports always report `failed: 0`, because any recipe that fails fails the whole import.
   - A collection's import is a link batch marked with its kind.
   - Sharing several links at once is a `links` batch.
9. **Automatic tidy-ups send `tidy.ready`** like the ones started by hand. A run that's stopped sends nothing.
10. **Background work says Merran did it.** A cooking note turned into an edit is `by: null`, `via: "merran"`, as the spec says for background work. So are link batches, app imports and tidy runs, which finish in jobs.
11. **Walmart reports when the extension is done.** The server only hears from the extension one product at a time, so a new route, `POST /api/stores/walmart/filled`, takes the run's totals, and records `list.sent`. An extension too old to call it sends no `list.sent` for Walmart.
    - For Kroger, the web passes how many basket lines had no product. The server hasn't seen them, because the page leaves them out.
12. **Housekeeping sends nothing.** Merging duplicate list lines (the food re-keying job, **Same as**), moving items when a list is removed, and the gathered rows themselves send nothing. Gathered rows aren't in the deliveries log, and the daily clean-up clears them with the rest after 30 days.

## Global Constraints

- Every rule in `AGENTS.md` applies: routes mirror the API; words people read go in `apps/web/src/locales/en.json`; logical CSS classes only; readable, expanded code; match the code around you.
- New event names, exactly: `import.finished`, `tidy.ready`, `review.waiting`, `plan.changed`, `plan.autoplanned`, `meal.cooked`, `meal.skipped`, `list.changed`, `list.completed`, `list.sent`, `pantry.changed`.
- Gathered events: `plan.changed`, `list.changed` and `pantry.changed`.
  - The window is `30_000` ms.
  - The job's kind is `webhooks.gather`, with the key `webhooks.gather:<householdId>:<type>` and the payload `{ type }`.
  - It has `concurrency: 1` and the runner's default tries.
- Every payload starts with PR 1's context (`household`, `by`, `via`, `key`). Recipes are PR 1's `RecipeRef`. Every `url` is `linkBase()` + a path, or null without `MERRAN_PUBLIC_URL`:

  | Link | Path |
  |---|---|
  | Review | `/recipes/review` |
  | A link batch or collection | `/recipes/import/<jobId>` |
  | An app or archive import | `/settings/import-export` |
  | A week | `/plan?week=<its first day>` |

- **Where `record()` goes.** Call it with the entity manager or `tx` the change uses: inside the change's transaction, or, where there's none, before its last flush. `record()` flushes when it writes, and writes nothing when no webhook wants the event, so every function keeps its own flush.
  - In a job, call it with the job's last write when there is one. Otherwise call it with `ctx.em` just before the handler returns.
  - Never put it after a change has been saved without it, in a route handler, or in the web app.
- Call `record()` once per operation, with its totals: once for a bulk check, not once per row.
- **Tests run on SQLite and Postgres.**
  - Focused runs: `pnpm --filter @merran/server exec vitest run --project sqlite <path>`. The `test -- <pattern>` form ignores the pattern.
  - On Postgres: start `pnpm --filter @merran/server db:test-postgres`, then use `--project postgres`. Add `--maxWorkers=2` on a busy machine.
- **After API changes:**
  - Run `pnpm --filter @merran/server openapi`.
  - Then, in PowerShell: `$env:pnpm_config_cache_dir = "D:\Development\Mise\.local\pnpm-cache"; pnpm --filter @merran/web api; pnpm --filter @merran/extension api`.
  - The two `schema.d.ts` files must match.
- **Migrations:** `pnpm --filter @merran/server db:migration webhook_gathering`, with Postgres up. Then check the SQLite file:
  - It must add the columns and index with `alter table`/`create index`, never a `__temp_alter` rebuild of `webhook_events`. `webhook_deliveries` references that table, so a rebuild would cascade-delete its rows.
  - If Docker won't start, write the Postgres file by hand from the SQLite one.
  - The user's dev server applies a new migration at once. If you regenerate one, give it back its first name.
- Prettier only from the root (`pnpm format`) or on named folders, never on `docs/`.

## Review Focus

1. **Two people check things off in the same 30 seconds.** Two `list.changed` events go out, one each, with their own counts. The counts add up to everything checked. Owned by Task 2.
2. **A change is recorded while its household's merge is running.** It's sent by the next merge, 30 seconds on, never lost. Owned by Task 2.
3. **The webhook is deleted, or webhooks are turned off, between a change and its merge.** The rows are marked merged and nothing is sent. The next change starts a new window. Owned by Task 2.
4. **Made it pressed twice for the same meal on the same day.** One `meal.cooked`, not two. Owned by Task 6.
5. **The last item is checked off, then the list is put away.** One `list.completed`, not two. Putting away a list with things still unchecked sends one. Owned by Task 8.

---

### Task 1: Describe the new events

**Files:**
- Modify: `packages/shared/src/webhooks/events.ts`, `packages/shared/src/webhooks/events.test.ts`
- Modify: `apps/server/src/services/webhooks/payloads.ts`
- Modify: `apps/web/src/locales/en.json` (`settings.household.webhooks.areas`, `.events`, and descriptions if they exist)
- Regenerate: `apps/server/src/http/openapi/openapi.json`, `apps/web/src/lib/api/schema.d.ts`, `apps/extension/src/lib/schema.d.ts`
- Test: `apps/server/src/http/openapi/webhooks.test.ts` (unchanged; it already parses every event's example)

**Interfaces:**
- Produces, in `@merran/shared`:
  - `WEBHOOK_AREAS = ["recipes", "plan", "list", "pantry", "webhooks"]`.
  - `WEBHOOK_EVENTS`, in this order, all `pickable: true`. `webhook.test` stays last and unpickable.

    | Area | Events |
    |---|---|
    | `recipes` | the four recipe events, `import.finished`, `tidy.ready`, `review.waiting` |
    | `plan` | `plan.changed`, `plan.autoplanned`, `meal.cooked`, `meal.skipped` |
    | `list` | `list.changed`, `list.completed`, `list.sent` |
    | `pantry` | `pantry.changed` |

- Produces, in `payloads.ts`:
  - `appLink(path: string): string | null`.
  - `MealRefSchema`: `{ entryId, date, meal: z.enum(MEALS), pool: boolean, title, recipe: RecipeRefSchema.nullable(), side: RecipeRefSchema.nullable() }`.
    - `pool` means the entry is in the week's pool, and `date` is then that week's first day.
    - `title` is the recipe's name, or the note for a meal that's only a note.
    - `type MealRef = z.infer<typeof MealRefSchema>`.
  - `ListTallySchema`: `{ id, name, left: int, checked: int }`.
  - `STORES = ["kroger", "walmart"] as const`.
- Produces: `WEBHOOK_PAYLOADS`, `EXAMPLES` and `WEBHOOK_SUMMARIES` entries for each new event. Counts are `z.number().int().min(0)`; each field gets a `.openapi({ description })`.

  | Event | Carries (besides the context) |
  |---|---|
  | `import.finished` | `import: { id }` (its job); `kind: "links" \| "collection" \| "app" \| "archive"`; `app: "mealie" \| "paprika" \| null`; `added`, `skipped`, `failed`; `url` |
  | `tidy.ready` | `count` (min 1); `recipes: RecipeRef[]` (max 10); `url` (Review) |
  | `review.waiting` | `source: "mcp" \| "cook_note"`; `count` (min 1); `recipe: RecipeRef \| null`; `url` (Review) |
  | `plan.changed` | `days: string[]`, sorted; `pools: string[]` (weeks whose pool was touched, by first day); `added`, `moved`, `changed`, `removed` |
  | `plan.autoplanned` | `week` (its first day); `meals`; `url` (the week) |
  | `meal.cooked` | `...MealRefSchema.shape`; `servings: number \| null`; `planned: boolean` |
  | `meal.skipped` | `...MealRefSchema.shape` |
  | `list.changed` | `lists: ListTally[]`; `added`, `checked`, `unchecked`, `changed`, `removed` |
  | `list.completed` | `list: { id, name }`; `bought`; `left` |
  | `list.sent` | `store: { id: z.enum(STORES), name }`; `sent`; `notFound` |
  | `pantry.changed` | `added`, `usedUp`, `moved`, `changed`, `removed` |

  Examples use the ids in `http/schemas/examples.ts`: `IDS.job`, `IDS.planEntry`, `IDS.shoppingList`, `IDS.costcoList`, `IDS.lemonChicken`, `IDS.garlicRice`.

- Copy (en.json, under `settings.household.webhooks`). If PR 1 added a description per event, use the right-hand column in the same shape.

  | Key | Label | Description |
  |---|---|---|
  | `areas.plan` | "Plan" | |
  | `areas.list` | "Shopping list" | |
  | `areas.pantry` | "Pantry" | |
  | `events.import.finished` | "An import finishes" | "A batch of links, an import from another app or a Merran archive is done." |
  | `events.tidy.ready` | "Tidy up has suggestions" | "Suggestions from tidying one recipe or many are waiting in Review." |
  | `events.review.waiting` | "Something waits in Review" | "An AI app proposed something, or a cooking note became an edit." |
  | `events.plan.changed` | "The plan changes" | "Meals added, moved, changed or removed, gathered over 30 seconds." |
  | `events.plan.autoplanned` | "The autoplan plans a week" | "On its schedule, or when someone runs it." |
  | `events.meal.cooked` | "A meal is made" | "Made it, from cook view, the plan, Today or a recipe." |
  | `events.meal.skipped` | "A meal is skipped" | "A planned meal is marked Didn't." |
  | `events.list.changed` | "The list changes" | "Things added, checked off, changed or removed, gathered over 30 seconds." |
  | `events.list.completed` | "A list is finished" | "The last thing is checked off, or it's put away with things left." |
  | `events.list.sent` | "A list goes to a store" | "Sent to the Kroger cart, or to Walmart's through the extension." |
  | `events.pantry.changed` | "The pantry changes" | "Things put away, used up, moved, changed or removed, gathered over 30 seconds." |

- [ ] **Step 1: Write the failing test.** In `events.test.ts`, add `"every area has an event, and the plan's come in order"`:
  - each of `WEBHOOK_AREAS` has at least one event;
  - the types of the `plan` area are exactly `["plan.changed", "plan.autoplanned", "meal.cooked", "meal.skipped"]`.
- [ ] **Step 2: Run it and watch it fail.** `pnpm --filter @merran/shared exec vitest run src/webhooks`. Expected: FAIL (there's no `plan` area).
- [ ] **Step 3: Implement** the catalog, the payloads, examples and summaries, and the strings. Each summary is a sentence like PR 1's ("An import finished"), and each description follows the spec's "When" column and Decisions 3 to 12.
- [ ] **Step 4: Regenerate and check.**
  - Run `pnpm --filter @merran/server openapi` and the two `api` scripts (Global Constraints).
  - `pnpm --filter @merran/server exec vitest run --project sqlite src/http/openapi` passes. It parses every example, and `document.test.ts` checks the saved file.
  - `pnpm typecheck` and `pnpm --filter @merran/web check:locales` pass.
- [ ] **Step 5: Commit:** "Describe the rest of the first webhook events".

### Task 2: Gathering

**Files:**
- Modify: `apps/server/src/database/entities/webhook_events.ts`
- Create: migrations through `pnpm --filter @merran/server db:migration webhook_gathering`
- Create: `apps/server/src/services/webhooks/gathering/gathering.ts`, `gather-job.ts`, `gathering.test.ts`
- Modify: `apps/server/src/services/webhooks/record.ts`, `apps/server/src/services/jobs/handlers.ts` (`gatherJob` in `JOB_HANDLERS`)
- Create: `apps/server/src/test/webhooks.ts` (helpers for every event test after this one)

**Interfaces:**
- Consumes: Task 1's payloads. From PR 1: `createJob`, `ACTIVE`, `wakeRunner`, `webhooksWanting`, `inHouseholdTransaction`, `withActor`.
- Produces, on `WebhookEvent`:
  - `gathered: p.boolean().default(false)`: "A small change waiting to be merged with others like it."
  - `merged: p.boolean().default(false)`: "Merged into the event that was sent."
  - The index `{ properties: ["household", "gathered", "merged"] }`.
- Produces, in `gathering.ts`:
  - `GATHERED_EVENTS = ["plan.changed", "list.changed", "pantry.changed"] as const`, `type GatheredEventType`, `isGathered(type: WebhookEventType): type is GatheredEventType`.
  - `GATHER_MS = 30_000`, `WEBHOOK_GATHER_JOB = "webhooks.gather"`.
  - `type GatheredPart<T extends GatheredEventType>`. Counts are optional and absent means 0:
    - `plan.changed`: `{ days?: string[]; pools?: string[]; added?; moved?; changed?; removed? }`
    - `list.changed`: `{ lists: string[]; added?; checked?; unchecked?; changed?; removed? }` (list ids)
    - `pantry.changed`: `{ added?; usedUp?; moved?; changed?; removed? }`
  - `isEmptyPart(part: GatheredPart<GatheredEventType>): boolean`: every count is 0 or absent.
  - `queueGathering(em: EntityManager, householdId: string, type: GatheredEventType): Promise<void>`. It looks for an active job with the key:
    - A queued one: it does nothing; that job will take this change.
    - A running one: it re-arms it with a conditional update, `nativeUpdate(Job, { id, status: "running" }, { attempts: 0, runAt: now + GATHER_MS })`, and stops there if a row changed.
    - Otherwise: `createJob(em, { kind, key, householdId, payload: { type }, runAt: now + GATHER_MS })`.
- Produces, in `record.ts`:
  - `type RecordedData<T extends WebhookEventType> = T extends GatheredEventType ? GatheredPart<T> : EventData<T>`. `record()`'s `data` becomes `RecordedData<T>`.
  - `record()` keeps its checks (webhooks on, something wants the type). Then, for a gathered type without `only`, it:
    - returns null for an empty part;
    - otherwise saves `WebhookEvent { gathered: true, payload: { household, ...actor, ...part } }` with no deliveries, calls `queueGathering`, flushes and returns the row.
  - `sendEvent<T extends WebhookEventType>(em, householdId, event: { type: T; data: EventData<T>; actor?: Actor }): Promise<WebhookEvent | null>`: today's path (save the event, its deliveries and their jobs in one flush). `record()` uses it for every other event, and so does the merge job.
- Produces, in `gather-job.ts`:
  - `mergeParts<T extends GatheredEventType>(em: EntityManager, type: T, parts: GatheredPart<T>[]): Promise<EventData<T>>`.
    - Counts add up.
    - `days` and `pools` are de-duplicated and sorted.
    - For `list.changed`, `lists` are de-duplicated and each is told as it is now: its name, `left` (unchecked) and `checked`, counted with `em.count`. A list deleted since is left out.
  - `gatherJob: JobHandler`, `{ kind: WEBHOOK_GATHER_JOB, concurrency: 1, run }`. In one `inHouseholdTransaction` it:
    1. loads the household's `{ type, gathered: true, merged: false }` rows, oldest first;
    2. groups them by who (`by?.id`, `via`, `key?.id`), in the order each first appears;
    3. for each group, calls `sendEvent(tx, …, { type, data: await mergeParts(...), actor })`;
    4. marks every row it loaded `merged`.

    It returns `{ merged: rows, sent: groups }`. A payload `type` that isn't gathered fails the job.
- Produces, in `test/webhooks.ts`:
  - `listenToEverything(client: TestClient): Promise<void>`: sets the home network to `all`, and adds a webhook with `everything: true` at `http://127.0.0.1:9/h`, as `recipe-events.test.ts` does.
  - `sentEvents(database: Database, householdId: string, type?: string): Promise<Record<string, any>[]>`: rows with `gathered: false`, oldest first, as `{ type, ...payload }`. It parses each one's `envelopeBody` with `webhookEnvelopeSchema(type)` first, so every event test also checks the payload matches its schema (the spec's "Tests").
  - `eventsFrom(database, householdId, action: () => Promise<unknown>)`: the sent events an action adds.
  - `gatherNow(database: Database, jobs: JobRunner): Promise<void>`: sets every queued `webhooks.gather` job's `runAt` to now, then `jobs.drain()`.

- [ ] **Step 1: Write the failing tests** in `gathering.test.ts`. Use `createTestApp`, `setUpServer` and `listenToEverything`, and call `record()` through `forHousehold(database.em, home)`.
  - `"30 changes in a window make one event with exact counts"`:
    - 30 `record`s of `plan.changed`, each `{ days: [<one of three days>], added: 1 }`, and 2 with `{ removed: 1 }`, all inside `withActor(kyleActor, …)`;
    - before `gatherNow`, `sentEvents` is empty and there's exactly one queued `webhooks.gather` job, `runAt` 29 to 31 seconds out;
    - after it, there's one `plan.changed` with `added: 30`, `removed: 2`, `moved: 0`, `changed: 0`, the three days sorted, and `by.name` "Kyle";
    - every gathered row is `merged`.
  - `"each person's changes are their own event"` (Review Focus 1): 20 `list.changed` `{ checked: 1 }` as Kyle (`via: "app"`) and 10 as an API key (`via: "api"`, `key.name` "n8n"), on one list. Two events go out, with `checked` 20 and 10, each with its own `by`/`key`, and both have the list's `{ id, name, left, checked }`.
  - `"lists are told as they are when the merge is made"`: two lists touched. One is deleted before `gatherNow`, so only the other is in `lists`.
  - `"a change during a merge is sent by the next one"` (Review Focus 2):
    - mark the queued gather job `running` with `attempts: 1` (nativeUpdate), then record another change;
    - the same job now has `attempts: 0` and `runAt` about 30 seconds out, and no second job was made;
    - set it back to queued (as the runner's `#endTry` does when `attempts` no longer matches) and `gatherNow`: the change is sent.
  - `"a webhook gone before the merge sends nothing"` (Review Focus 3): record a change, delete the webhook (through the route), `gatherNow`. Nothing is sent and the rows are `merged`. Add the webhook again and record another change: it's sent on its own, not with the old one.
  - `"webhooks off before the merge sends nothing"`: the same with `configureWebhooks({ enabled: false, publicUrl: null })`, restored after.
  - `"an empty part records nothing"`: `record(… { type: "pantry.changed", data: {} })` returns null, and no job is queued.
  - `"a change that rolls back leaves nothing to gather"`: `inHouseholdTransaction(em, home, async (tx) => { await record(tx, …); throw … })` leaves no row and no job.
  - `"other events aren't gathered"`: `recipe.deleted` is sent at once, with a delivery and no gather job.
- [ ] **Step 2: Run them and watch them fail.** `pnpm --filter @merran/server exec vitest run --project sqlite src/services/webhooks/gathering`. Expected: FAIL.
- [ ] **Step 3: Add the columns and index, and make the migrations** (Global Constraints). `pnpm --filter @merran/server exec vitest run --project sqlite src/database` passes.
- [ ] **Step 4: Implement** `gathering.ts`, `gather-job.ts`, the change to `record.ts`, the handler, and `test/webhooks.ts`.
- [ ] **Step 5: Run them again,** plus the PR 1 suites that use `record()`: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/webhooks src/http/routes/households/current/webhooks`. Then the same on `--project postgres`. Expected: PASS.
- [ ] **Step 6: Commit:** "Gather busy webhook events into one every 30 seconds".

### Task 3: `import.finished`

**Files:**
- Modify: `apps/server/src/services/recipes/import/import-links.ts`:
  - `startLinkImport` takes an optional `kind: "links" | "collection"` (default `links`), kept in the job's payload;
  - `linkImportJob.run` records before `return soFar()`.
- Modify: `apps/server/src/http/routes/collections/[collection]/import/post.ts` (passes `kind: "collection"`)
- Modify: `apps/server/src/services/recipes/import/apps/job.ts` (records before `return result`)
- Modify: `apps/server/src/services/transfer/import.ts` (records before its return)
- Test: `apps/server/src/services/webhooks/events/imports.test.ts`

**Interfaces:**
- Consumes: `record`, `appLink` (Tasks 1 and 2); `test/webhooks.ts`.
- Each records `import.finished` with `ctx.em` and `import: { id: ctx.jobId }`:

  | Import | `kind` | `app` | Counts | `url` |
  |---|---|---|---|---|
  | Link batch | `links` or `collection` | null | added = items `added`, skipped = `already`, failed = `failed` | `/recipes/import/<jobId>` |
  | Another app | `app` | `source.app` | from `bringIn`'s result: `recipes`, `skipped`, `failed` | `/settings/import-export` |
  | Archive | `archive` | null | `recipes`, `skipped`, `failed: 0` | `/settings/import-export` |

- [ ] **Step 1: Write the failing tests,** copying each import's own test setup (named below).
  - `"a batch of links says how it went"`: `links.test.ts`'s fake fetcher, three links (one good, one already in the library, one broken). After `jobs.drain()`, one `import.finished` with `kind: "links"`, `added: 1`, `skipped: 1`, `failed: 1`, `by: null`, `via: "merran"`, and `url` ending `/recipes/import/<jobId>`.
  - `"a collection's import says it's a collection"`: as `sites.test.ts` starts one, then `jobs.drain()`. `kind: "collection"`.
  - `"an app import counts what came over"`: `files.test.ts`'s `zipOf` Mealie backup with two recipes. `kind: "app"`, `app: "mealie"`, `added: 2`. No `recipe.created` events.
  - `"a Merran archive counts what came over"`: as `import.test.ts`'s `importInto`. `kind: "archive"`, `failed: 0`.
  - `"a stopped batch sends nothing"`: as `links.test.ts`'s Stop test. No `import.finished`.
- [ ] **Step 2: Run them and watch them fail.** `pnpm --filter @merran/server exec vitest run --project sqlite src/services/webhooks/events/imports`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** with the import suites: `… src/http/routes/recipes/import src/http/routes/households/current/import src/http/routes/sites`. Expected: PASS.
- [ ] **Step 5: Commit:** "Tell webhooks when an import finishes".

### Task 4: `tidy.ready` and `review.waiting`

**Files:**
- Modify: `apps/server/src/services/recipes/review/tidy.ts` (`proposeTidy`: when there's no `jobId`, record in its `tx` before its flush)
- Modify: `apps/server/src/services/recipes/review/tidy-run.ts` (`tidyRunJob.run`: when `counts.suggested > 0`, record before `return counts`)
- Modify: `apps/server/src/services/mcp/server.ts` (`propose`: `createProposal` and `record` in one `inHouseholdTransaction`)
- Modify: `apps/server/src/services/recipes/review/note-edits.ts` (`proposeNoteEdit`: record in its `tx` before its flush)
- Test: `apps/server/src/services/webhooks/events/review.test.ts`

**Interfaces:**
- `tidy.ready` for one recipe: `{ count: 1, recipes: [recipeRef(recipe)], url: appLink("/recipes/review") }`.
- `tidy.ready` for a run: `count` is how many of the run's proposals are still pending (`Proposal` where `job` is this job's id and `status` is `"pending"`), and `recipes` are the first 10 of them, oldest first, with their recipes populated.
- `review.waiting` from MCP: `{ source: "mcp", count: 1, recipe: <the proposal's recipe, or null>, url }`. Assistant chats never record: they don't go through the MCP `propose`.
- `review.waiting` from a note: `{ source: "cook_note", count: 1, recipe: recipeRef(recipe), url }`.

- [ ] **Step 1: Write the failing tests,** with `tidy.test.ts`'s and `swap.test.ts`'s mock AI setup, and `mcp.test.ts`'s `makeKey` and `call`.
  - `"tidying one recipe with suggestions tells webhooks"`: `POST /api/recipes/{slug}/tidy` gives one `tidy.ready` with `count: 1` and `url` "http://merran.test/recipes/review". When the AI suggests nothing, there's none.
  - `"a tidy run sends one event for the run"`: a run over 12 recipes, each with suggestions, gives one `tidy.ready` with `count: 12` and 10 `recipes`, `by: null`. No per-recipe events.
  - `"an AI app's proposal waits in Review"`: `propose_recipe_edit` over MCP gives `review.waiting` with `source: "mcp"`, the recipe, `via: "mcp"` and the key's name. `propose_meals` gives one with `recipe: null`.
  - `"a proposal from your own chat sends nothing"`: a proposal made in an assistant chat (as `assistant.test.ts` does) records no `review.waiting`.
  - `"a cooking note turned into an edit waits in Review"`: a cooking note, then `jobs.drain()`. `review.waiting` has `source: "cook_note"`, the recipe and `by: null`.
- [ ] **Step 2: Run them and watch them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** with `src/http/routes/recipes/tidy`, `src/http/mcp` and `src/http/routes/assistant`. Expected: PASS.
- [ ] **Step 5: Commit:** "Tell webhooks when tidy-up suggestions or proposals wait in Review".

### Task 5: `plan.changed` and `plan.autoplanned`

**Files:**
- Create: `apps/server/src/services/webhooks/events/plan.ts`
- Create: `apps/server/src/services/plan/snapshots.ts`. Move `snapshotOf` and `EntrySnapshot` there from `plan.ts`, which re-exports them, so its other importers don't change. Then `events/plan.ts` can use them without importing `plan.ts`, which imports it.
- Modify: `apps/server/src/services/plan/plan.ts`. Each function snapshots the entries it touches before changing them (`snapshotOf`), then calls `recordPlanEvents` before its last flush:
  - `addEntry`, `addEntries`
  - `updateEntry`, `removeEntry`
  - `bulkPlan` (its `before` snapshots exist already)
  - `restoreEntries` (with `undo: true`)
  - `repeatLastWeek`, `clearRest`
  - `cookTodayIn`: its `before` is the entries it will cook (today's planned ones, or the pool entry it moves), and its `after` is the entries it cooked, including one it made
- Modify: `apps/server/src/services/plan/autoplan.ts` (`noteRun` records `plan.autoplanned` before its flush)
- Test: `apps/server/src/services/webhooks/events/plan.test.ts`

**Interfaces:**
- Produces, in `events/plan.ts`:
  - `planChange(before: readonly EntrySnapshot[], after: readonly EntrySnapshot[]): GatheredPart<"plan.changed">`. Entries are matched by id:
    - in `after` only: added;
    - in `before` only: removed;
    - in both, with a different `date`, `anyDay`, `meal` or `position`: moved;
    - otherwise, with a different `recipe`, `withRecipe`, `note`, `servings` or `variants` (as JSON): changed;
    - otherwise nothing: status, `cookedAt`, `listedAt` and `why` don't count.

    Every counted entry adds the place it was and the place it is to `days` (`date` when not `anyDay`) or `pools` (`date` when `anyDay`).
  - `recordPlanEvents(em: EntityManager, householdId: string, change: { before: readonly EntrySnapshot[]; after: readonly PlanEntry[]; undo?: boolean }): Promise<void>`. It records `planChange(before, after.map(snapshotOf))` as `plan.changed`. Task 6 adds the meal events here.
- `plan.autoplanned`: `{ week: run.week, meals: run.planned, url: appLink(`/plan?week=${run.week}`) }`. Its actor is the person when it's run by hand, and Merran on its schedule. The run's own adds also send `plan.changed` (Decision 4).

- [ ] **Step 1: Write the failing tests.**
  - `planChange` on its own, as a table:
    - an add, a remove, a move to another day, a move into the pool, a reorder, a recipe swap, a servings change and a status-only change, each giving its one count (the status-only change gives none);
    - a move gives both days.
  - Through the routes, copying `plan.test.ts`'s setup (UTC, weeks from Monday) and helpers, then `gatherNow`. One test each:
    - add one (`added: 1`, its day);
    - add a batch;
    - move one with PATCH (`moved: 1`, both days);
    - remove one;
    - bulk swap (`moved: 2`);
    - Undo of a bulk remove (`added`, from `restoreEntries`);
    - Repeat last week;
    - Clear;
    - PATCH that only sets `status: "cooked"` (no `plan.changed`).
  - `"the autoplan tells webhooks it planned the week"`: by hand (`POST /api/plan/autoplan/run`), it records `plan.autoplanned` with the week, `meals` equal to the run's `planned`, `by` Kyle, and `url` ending `/plan?week=<week>`. On its schedule (`autoplan.test.ts`'s `hurry`/`timeComes`), it's `by: null`. Both runs also send `plan.changed` with `added` equal to `meals`.
- [ ] **Step 2: Run them and watch them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** with `src/http/routes/plan` and `src/http/routes/recipes/[recipe]/made`. Expected: PASS.
- [ ] **Step 5: Commit:** "Tell webhooks when the plan changes and when the autoplan runs".

### Task 6: `meal.cooked` and `meal.skipped`

**Files:**
- Modify: `apps/server/src/services/webhooks/events/plan.ts` (`recordPlanEvents`)
- Test: `apps/server/src/services/webhooks/events/meals.test.ts`

**Interfaces:**
- Consumes: Task 5's `recordPlanEvents` call sites, unchanged.
- Produces, in `events/plan.ts`:
  - `mealRef(em: EntityManager, entry: PlanEntry): Promise<MealRef>`. It loads the recipe and side when they aren't loaded. `title` is the recipe's name (the variant's, when the entry has one, as `describeEntry` does), else the note.
  - `recordPlanEvents`, unless `undo`, also records, for each entry of `after`:
    - `meal.cooked` when it's `cooked` and wasn't in `before` as `cooked`. `planned` is whether it was in `before`. `servings` is the entry's, else its variant's or recipe's, else null.
    - `meal.skipped` when it's `skipped` and wasn't in `before` as `skipped`.
- `cookTodayIn`'s early return, for a meal already made today, records nothing, since it returns before `recordPlanEvents`.

- [ ] **Step 1: Write the failing tests,** copying `made.test.ts`'s and `unmarked.test.ts`'s setup:
  - `"Made it on a planned meal"`: PATCH `status: "cooked"` with `servings: 3` gives `meal.cooked` with the entry's date, `meal: "dinner"`, `pool: false`, the recipe, `servings: 3` and `planned: true`.
  - `"Made it off the plan"`: `POST /api/recipes/{slug}/made` with nothing planned gives `planned: false` and today's date. With the recipe in the week's pool, it gives `planned: true`, and `plan.changed` has `moved: 1`.
  - `"Made it twice on the same day sends one"` (Review Focus 4).
  - `"Made them all on Today"`: bulk `status: "cooked"` on two meals gives two `meal.cooked`.
  - `"Didn't"`: PATCH `status: "skipped"` gives `meal.skipped`. Setting it back to `planned` gives nothing more.
  - `"Undo never makes or skips again"`: bulk remove a cooked meal, then `/api/plan/restore`. Only `plan.changed`.
  - `"a meal that's only a note"`: `recipe: null`, `title` the note.
- [ ] **Step 2: Run them and watch them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** with the plan and made suites. Expected: PASS.
- [ ] **Step 5: Commit:** "Tell webhooks when a meal is made or skipped".

### Task 7: `list.changed`: adding, changing and removing

**Files:**
- Create: `apps/server/src/services/webhooks/events/list.ts`
- Modify, each recording once with its totals:

  | File | Function | Records |
  |---|---|---|
  | `services/list/list.ts` | `typedItem` (under `addTyped`, `ranOut`, proposals) | `added: 1` for a new row, `changed: 1` when it joins one |
  | `services/list/list.ts` | `updateItem` | `changed: 1` when a field besides `checked` changes; both lists when it moves |
  | `services/list/list.ts` | `removeItem`, `bulkItems` (remove) | `removed` |
  | `services/list/list.ts` | `clearList` | `removed`, for each list it clears |
  | `services/list/list.ts` | `restoreItems` | `added` for rows it brings back, `removed` for its `remove` |
  | `services/list/meals.ts` | `addMealNeeds` | `added` and `changed` (its `{ added, merged }`) |
  | `services/list/meals.ts` | `addEveryWeek` | `added` |
  | `services/list/meals.ts` | `unlistMeals` | `removed` for rows it takes off, `changed` for rows it lowers |
  | `services/list/usual.ts` | `addUsualBuys` | `added` |
  | `services/list/covered.ts` | `addNeeds` (under `putShortOnList`, `notAtHome`) | `added`, `changed` |
  | `services/list/substitutions/quantities.ts` | `updateSwapQuantities` | `added`, `removed` |
  | `services/pantry/put-away/put-away.ts` | `putAway` | `removed`, per list |
  | `services/pantry/receipts/receipts.ts` | `addReceipt` (its `offTheList`) | `removed` |

  A function that doesn't take `householdId` gets it as a parameter. The re-keying job, `sameAs` and `saveLists` record nothing (Decision 12).
- Test: `apps/server/src/services/webhooks/events/list.test.ts`

**Interfaces:**
- Produces, in `events/list.ts`:
  - `recordListChange(em: EntityManager, householdId: string, rows: readonly ShoppingItem[], counts: Omit<GatheredPart<"list.changed">, "lists">): Promise<void>`. `lists` are the rows' distinct `list.id`s. It's a no-op when `rows` is empty.

- [ ] **Step 1: Write the failing tests,** with `list.test.ts`'s helpers, then `gatherNow`, reading `list.changed`. One test each:
  - typing one (`added: 1`, and the list's `left`);
  - typing one that joins a row (`changed: 1`);
  - editing an amount (`changed: 1`);
  - moving a row to another list (both lists in `lists`);
  - removing one;
  - a bulk remove of three (`removed: 3`);
  - **Clear the list**;
  - adding from the plan (`added` equal to the rows made);
  - removing a planned meal that put things on the list (`removed`);
  - usual buys;
  - Undo of a removal (`added`);
  - applying an MCP list proposal (`via: "app"`, whoever applied it).
- [ ] **Step 2: Run them and watch them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** with `src/http/routes/list`, `src/http/routes/pantry` and `src/http/routes/plan`. Expected: PASS.
- [ ] **Step 5: Commit:** "Tell webhooks what's added to and taken off the list".

### Task 8: Checking off, and `list.completed`

**Files:**
- Modify: `apps/server/src/services/pantry/put-away/checking.ts`. `setChecked` returns the rows it claimed, and takes `options?: { undo?: boolean }`.
- Modify: `apps/server/src/services/list/list.ts` (`restoreItems` passes `{ undo: true }`)
- Modify: `apps/server/src/services/pantry/put-away/put-away.ts` (`putAway`)
- Modify: `apps/server/src/services/webhooks/events/list.ts`
- Test: `apps/server/src/services/webhooks/events/list.test.ts` (a `describe("checking off")`)

**Interfaces:**
- Produces, in `events/list.ts`: `recordChecking(tx: EntityManager, householdId: string, claimed: readonly ShoppingItem[], checked: boolean, options: { undo: boolean }): Promise<void>`. `setChecked` calls it once, after its loop. It records:
  - `list.changed` with `checked` or `unchecked` equal to `claimed.length`;
  - when checking and not `undo`, for each distinct list among `claimed` that now has no unchecked rows, `list.completed` with `{ list: { id, name }, bought: <its checked rows>, left: 0 }`.
- `putAway` records, for each list it clears whose unchecked count is above 0, `list.completed` with `{ bought: <checked rows of that list>, left: <its unchecked rows> }` (Decision 7). Count before removing.

- [ ] **Step 1: Write the failing tests.**
  - `"checking things off is gathered"`: checking three one at a time, plus a bulk check of two, makes one `list.changed` with `checked: 5`. Unchecking one makes `unchecked: 1`.
  - `"checking off the last thing finishes the list"`: `list.completed` has the list, `bought` (every checked row) and `left: 0`, and it's recorded at once, not gathered.
  - `"a bulk check that finishes two lists finishes both"`.
  - `"one trip sends one list.completed"` (Review Focus 5):
    - finish a list, then put it away: one `list.completed` in all;
    - put away a list with two things unchecked: one, with `left: 2`.
  - `"Undo never finishes a list"`: uncheck the last row, then Undo it through `/api/list/restore`. No new `list.completed`.
  - `"checking off puts things away"`: with the household putting away when checked, checking one off also sends `pantry.changed` `{ added: 1 }`, once Task 10 is in. Mark it `test.todo` until then.
- [ ] **Step 2: Run them and watch them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** with `src/http/routes/list` (`put-away.test.ts` especially). Expected: PASS.
- [ ] **Step 5: Commit:** "Tell webhooks when things are checked off and a list is finished".

### Task 9: `list.sent`

**Files:**
- Modify: `apps/server/src/services/stores/kroger/basket.ts`. `sendKrogerBasket` takes `householdId` and `notFound`, and records before its flush.
- Modify: `apps/server/src/http/routes/stores/kroger/send/post.ts`, `apps/server/src/http/schemas/stores.ts` (`SendBasketSchema` gains `notFound: z.number().int().min(0).default(0)`)
- Modify: `apps/web/src/features/stores/kroger-basket-page.tsx` (sends `notFound: basket.lines.filter((line) => !line.product).length`)
- Create: `apps/server/src/http/routes/stores/walmart/filled/index.ts`, `post.ts`. Modify `walmart/index.ts` to register it.
- Modify: `apps/server/src/services/stores/walmart/basket.ts` (`walmartFilled`)
- Modify: `apps/extension/src/lib/walmart.ts`. `runFill`, when it ends `done` or `stopped`, posts the totals once. `added.length` is `sent`, and `skipped.length` is `notFound`.
- Regenerate: the spec and both clients
- Modify: `apps/extension/README.md` (what it reports)
- Test: `apps/server/src/services/webhooks/events/stores.test.ts`

**Interfaces:**
- `POST /api/stores/walmart/filled`:
  - `operationId: "walmartFilled"`, tag `Stores`, `openToKeys("list", "write")` like `/stores/walmart/sent`;
  - body `{ sent: int ≥ 0, notFound: int ≥ 0 }`;
  - 204 when done, and the errors `/sent` has when Walmart isn't on;
  - summary "Say a Walmart fill is done".
- `walmartFilled(deps: StoreDeps, em: EntityManager, householdId: string, totals: { sent: number; notFound: number }): Promise<void>`: `needWalmart(deps)`, then `list.sent` `{ store: { id: "walmart", name: "Walmart" }, sent, notFound }`.
- `sendKrogerBasket(deps: BasketDeps, em: EntityManager, householdId: string, request: { lines: { itemId: string; packages: number }[]; notFound: number })`. It records `{ store: { id: "kroger", name: location.banner }, sent: Object.keys(sent).length, notFound }` before its flush, after `addToCart` succeeds.

- [ ] **Step 1: Write the failing tests.**
  - `"sending to Kroger tells webhooks"`: `stores.test.ts`'s fake Kroger fetcher and `link()`. A send of two lines with `notFound: 1` gives `list.sent` with the banner, `sent: 2`, `notFound: 1`. A send that fails at Kroger records nothing.
  - `"the extension says when a Walmart fill is done"`: `POST /api/stores/walmart/filled` `{ sent: 4, notFound: 1 }` gives 204 and `list.sent` for Walmart. Without the Walmart module, the same error as `/sent`.
- [ ] **Step 2: Run them and watch them fail.** Expected: FAIL.
- [ ] **Step 3: Implement,** regenerate (Global Constraints), and build the extension: `pnpm --filter @merran/extension build` and `build:firefox`.
- [ ] **Step 4: Run them again,** with `src/http/routes/stores`, and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** "Tell webhooks when a list goes to a store's cart".

### Task 10: `pantry.changed`

**Files:**
- Modify, each recording once with its totals:

  | File | Function | Records |
  |---|---|---|
  | `services/pantry/pantry.ts` | `addTyped` | `added: 1`, or `changed: 1` when it joins an item |
  | `services/pantry/pantry.ts` | `updateItem` | `moved: 1` when `storedIn` changes, `changed: 1` when anything else does |
  | `services/pantry/pantry.ts` | `splitItem` | `moved: 1` |
  | `services/pantry/pantry.ts` | `removeItem`, `bulkItems` (remove) | `usedUp` (the app calls both **Used up**) |
  | `services/pantry/pantry.ts` | `bulkItems` (`storedIn`) | `moved`, for the rows that really moved |
  | `services/pantry/pantry.ts` | `clearPantry` | `removed` |
  | `services/pantry/pantry.ts` | `restoreItems` | `added` |
  | `services/pantry/put-away/put-away.ts` | `putAway` | `added`, for the rows it put away |
  | `services/pantry/put-away/checking.ts` | `setChecked` | `added` when checking puts rows away; `removed` for what unchecking takes back |
  | `services/pantry/put-away/checking.ts` | `putAwayAlreadyChecked` | `added` |
  | `services/pantry/receipts/receipts.ts` | `addReceipt` | `added` |
  | `services/pantry/ran-out.ts` | `ranOut` | `usedUp: 1` |
  | `services/list/covered.ts` | `notAtHome` | `removed: 1` (it wasn't there) |
  | `services/pantry/cooking.ts` | `useForMeals` | `usedUp`: items it takes from, wholly or in part |
  | `services/pantry/cooking.ts` | `putBack` | `added` for items it makes again, `changed` for items it adds to |

  A function that doesn't take `householdId` gets it as a parameter (the pantry item delete route passes it from `inHousehold(c)`).
- Modify: `apps/server/src/services/webhooks/events/list.test.ts` (Task 8's `test.todo` becomes a test)
- Test: `apps/server/src/services/webhooks/events/pantry.test.ts`

**Interfaces:**
- Consumes: `record` with `type: "pantry.changed"`. `record()` skips an empty part, so callers pass their counts without checking for 0.

- [ ] **Step 1: Write the failing tests,** with `pantry.test.ts`'s `add()`, then `gatherNow`, reading `pantry.changed`. One test each:
  - add one;
  - move one to the freezer;
  - split one;
  - **Used up** one;
  - bulk **Used up** two;
  - bulk move;
  - **Clear the pantry**;
  - Undo of a Used up;
  - put away from the list;
  - a receipt;
  - **Ran out**;
  - cooking a planned meal that uses two pantry items (`usedUp: 2`);
  - un-cooking it (`added` or `changed`).
- [ ] **Step 2: Run them and watch them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** with `src/http/routes/pantry`, `src/http/routes/list`, `src/http/routes/plan` and `src/http/routes/recipes/[recipe]/made`. Expected: PASS.
- [ ] **Step 5: Commit:** "Tell webhooks when the pantry changes".

### Task 11: The page, the guide and the docs

**Files:**
- Modify: `apps/docs/src/content/docs/docs/integrations/webhooks.md`:
  - the events table gets every new event;
  - drop "More events, for cooking, the plan, the list and the pantry, are planned", and say cooking and the daily summary are still to come;
  - a **Gathered events** paragraph: 30 seconds, one event per person, exact counts;
  - a section per new event with its sample body, taken from `openapi.json`'s `webhooks` section;
  - a Home Assistant example that says "The shopping list is done" on `list.completed`.
- Modify: `apps/docs/src/content/docs/docs/integrations/walmart.md` and `browser-extension.md`: the extension tells Merran when a fill is done, for webhooks
- Modify: `apps/docs/src/content/docs/docs/project/roadmap.md` (line 76: what's there now, and what's next)
- Modify: `docs/webhooks.md`:
  - the status line says PR 2 was built, with the date;
  - Decisions 1 to 12 go in the Decisions table or the sections they belong to, dated;
  - "Data": `webhook_events` gains `gathered` and `merged` now, and the key with slice 3.
- Modify: `docs/features.md` (the Webhooks row: what PR 2 adds, and what's next)

The guide quotes the app's labels exactly, and describes main as released.

- [ ] **Step 1: Write the guide and doc changes.**
- [ ] **Step 2: Check the page in the browser,** on a server started from the worktree:
  - Add the servers to the worktree's `.claude/launch.json` and start them with `preview_start`. Afterwards run `git checkout -- .claude/launch.json`.
  - Sign in as the dev household's admin. Open **Settings → Webhooks → Add webhook**:
    - the picker shows **Recipes**, **Plan**, **Shopping list** and **Pantry** with the new labels;
    - at 375px it opens as a drawer.
  - Add a webhook to a local receiver (`node -e` running an `http` server on `127.0.0.1:8787`, home network allowed). Then:
    - check three things off: after about 30 seconds, one `list.changed` arrives, and its delivery shows in the log;
    - mark a meal Made it: `meal.cooked` arrives.
- [ ] **Step 3: Run every check the pull request touches:**
  - `pnpm typecheck`
  - `pnpm format:check` (`pnpm format` to fix)
  - `pnpm --filter @merran/server test:all`, with Postgres up
  - `pnpm --filter @merran/shared test`
  - `pnpm --filter @merran/web test` and `check:locales`
  - `pnpm --filter @merran/extension build` and `build:firefox`
  - `pnpm docs:build`, which checks every link

  Expected: all pass.
- [ ] **Step 4: Commit:** "Document the rest of the first webhook events".

### Task 12: The pull request

- [ ] **Step 1:** Rebase onto `feat/webhooks`. Run Task 11's checks again if anything came in.
- [ ] **Step 2:** Push `feat/webhook-events`, and open the pull request:
  - base `feat/webhooks`;
  - title `feat: more webhook events`;
  - the body lists the events, gathering, the new Walmart route and the decisions above, and links this plan.
- [ ] **Step 3:** Bind it with the `ccd_pr` tools, and read its CI.
