# Job runner foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slice 2 of the speed work: two job lanes with a setting, limits per household, Stop and time limits that reach every fetch and AI call, a household `job` event on the live stream that the web app follows instead of polling, `GET /households/current/jobs`, and a link import that remembers its progress across a restart.

**Architecture:** The runner (`apps/server/src/services/jobs/runner.ts`) counts running jobs per lane, per kind and per household-and-kind, and leaves out of its look for due work every kind or household-and-kind that couldn't start. A job's stop signal is kept in AsyncLocalStorage for the length of its run, like `withActor`, so the fetcher, `useAi` and the video tools combine it with their own time limits without threading it through every function. The runner tells the event bus when a household's job starts, moves on and ends; the live stream sends it as `job`, and the web app refreshes that job's queries rather than polling them while the stream works.

**Tech Stack:** Hono with @hono/zod-openapi, MikroORM 7 (SQLite and Postgres), AI SDK 7 (`wrapLanguageModel`), Node's `AsyncLocalStorage`, React 19 with TanStack Query 5, vitest (server), node:test (web).

**Spec:** [docs/performance.md](../../performance.md): slice 2's row in The plan, findings 2–6, 8 and 10 under The job runner, decision 4, and What webhooks built.

## Global Constraints

- Two lanes: a **quick** lane of 4 for jobs that call no AI, open no pages and finish in seconds (emails, webhook deliveries, telemetry, the update check, the daily clean-up), and a **long** lane of 4 for the rest (imports, library runs, Discover, reading sites, prices, the autoplan, note edits, rekeying foods). Each kind says which lane it's in; the long lane's size is a setting, `MERRAN_JOBS_LONG`. (Decision 4, November 10, 2026.)
- Settings Merran needs to start go in `apps/server/src/core/config.ts`, each with a `MERRAN_` variable; after adding one, `pnpm --filter @merran/docs settings:generate`, and the site's `run/configuration.md` if people need it.
- API changes: `pnpm --filter @merran/server openapi`, then `pnpm --filter @merran/web api` and `pnpm --filter @merran/extension api` (both `schema.d.ts` identical). The `api` scripts fail in Git Bash here: run them in PowerShell with `pnpm_config_cache_dir` in `.local/`.
- Routes mirror the API: `GET /api/households/current/jobs` is `apps/server/src/http/routes/households/current/jobs/get.ts`.
- Comments are plain English and say why. Code is written for people to read: no packed one-liners.
- Prettier from the root only (`pnpm format`), never on `docs/`.
- A change isn't done until `docs/performance.md`, `docs/platform.md` (Jobs), `docs/stack.md` (how jobs are claimed) and `docs/features.md` say the same.

## Review Focus

1. **A job stopped mid-fetch records a failure instead of stopping.** A link import whose fetch is cut off by Stop must end cancelled, with the link it was on shown as stopped, not "failed: That site took too long". Pinned in Task 3 (fetcher rethrows the stop) and Task 7.
2. **The household that queues a hundred jobs of one kind still blocks everyone.** Without leaving its household-and-kind out of the look for due work, its waiting jobs fill the 50 places the look takes in, as finding 1 did for kinds. Pinned in Task 2.
3. **The live stream stops being trusted while a job is followed.** The web app must go back to polling at the old pace, not wait 30 s each time. Pinned in Task 6 (`followEvery`).
4. **An API key hears about jobs in areas it can't read.** Job events go only to listeners that may hear the job's area. Pinned in Task 4.
5. **A request's AI call that hangs.** Import from a link or from photos (in the request until slice 3 and 4) must give up after the AI time limit with words to show, not hold the request until the proxy cuts it. Pinned in Task 3.

---

### Task 1: Two lanes, and the long lane's setting

**Files:**
- Modify: `apps/server/src/services/jobs/runner.ts` (types, constructor, `#tick`, `#dueJobs`)
- Modify: `apps/server/src/services/jobs/handlers.ts` and every handler file it imports (`lane` on each)
- Modify: `apps/server/src/core/config.ts` (`jobsLong` boot setting, `Config.jobsLong`)
- Modify: `apps/server/src/index.ts:83` (passes `lanes`)
- Modify: `.env.example`, `apps/docs/src/content/docs/docs/run/configuration.md`, generated settings via `pnpm --filter @merran/docs settings:generate`
- Test: `apps/server/src/services/jobs/runner.test.ts`, `apps/server/src/services/jobs/handlers.test.ts` (new), `apps/server/src/core/config.test.ts`

**Interfaces:**
- Produces: `export type JobLane = "quick" | "long"`; `JobHandler.lane?: JobLane` (missing means long); `new JobRunner({ deps, handlers, schedules?, lanes?: Partial<Record<JobLane, number>> })` replacing `maxRunning`, defaults `{ quick: 4, long: 4 }`; `Config.jobsLong: number`.

- [ ] **Step 1: Write the failing tests**

In `runner.test.ts`, replace `{ maxRunning: 2 }` in "gives each household a fair share" with `{ lanes: { long: 2 } }`, and add:

```ts
test("a quick job doesn't wait while long ones fill their lane", async () => {
  // Two long jobs that hold the long lane (size 1 here) until released.
  // Enqueue them, then an email-like quick job; drain until the quick
  // one is done while the long ones are still running.
  // expect(quick.status).toBe("done"); expect(long[1].status).toBe("queued")
})

test("each lane runs as many as its size", async () => {
  // lanes { quick: 1, long: 2 }, three long kinds each concurrency 3:
  // at most 2 long jobs running at once (track a running counter's max).
  // expect(mostAtOnce).toBe(2)
})

test("a full lane's kinds are left out of the look for due work", async () => {
  // lanes { long: 1 }: one long job running and 60 more long jobs queued
  // (older), then one quick job queued last. The quick job still runs.
})
```

New `handlers.test.ts`:

```ts
test("every kind says which lane it's in", () => {
  const missing = JOB_HANDLERS.filter((handler) => handler.lane === undefined)
  expect(missing.map((handler) => handler.kind)).toEqual([])
})

test("emails, deliveries and housekeeping are quick; AI and pages are long", () => {
  const quick = JOB_HANDLERS.filter((h) => h.lane === "quick").map((h) => h.kind)
  expect(quick.sort()).toEqual(QUICK_KINDS.sort())
})
```

with `QUICK_KINDS` written out in the test: `email.invitation`, `email.passwordReset`, `telemetry.send`, `updates.check`, `jobs.cleanUp`, and the kinds of `webhookDeliveryJob`, `gatherJob`, `headsUpJob`, `closeSessionJob`, `timerDoneJob`, `endQuietSessionJob` (read their constants). Every other kind is `"long"`, `recipes.purgeDeleted` included (one network call per file on S3).

In `config.test.ts`: `MERRAN_JOBS_LONG` unset gives `jobsLong: 4`; `"8"` gives 8; `"0"` and `"100"` are problems.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/jobs src/core/config.test.ts`
Expected: FAIL: `lanes` isn't an option, `lane` is undefined on every handler, `jobsLong` is undefined.

- [ ] **Step 3: Implement**

- `runner.ts`: `JobLane`, `lane` on `JobHandler` (doc comment: which lane it waits in; quick is for jobs that call no AI, open no pages and finish in seconds), `lane` kept on `Running`. `#tick` counts running per lane, stops when no lane has room, and skips a job whose lane is full. `#dueJobs` leaves out the kinds at their limit and every kind of a full lane (one `$nin` list). Unknown kinds count as long.
- Each handler gets `lane: "quick"` or `lane: "long"`.
- `config.ts`: `jobsLong: numberSetting({ key: "server.jobsLong", env: "MERRAN_JOBS_LONG", envOnly: true, description: "How many long jobs run at once: imports, library runs, Discover, reading sites, prices. Quick jobs like emails and webhook deliveries have 4 places of their own.", schema: z.number().int().min(1).max(32), default: 4 })`, carried into `Config`.
- `index.ts`: `lanes: { long: config.jobsLong }`.
- `.env.example`: a commented `# MERRAN_JOBS_LONG=4` with one line of what it's for. `configuration.md`: a row for it. Run `pnpm --filter @merran/docs settings:generate`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/jobs src/core/config.test.ts`
Expected: PASS, every runner test included.

- [ ] **Step 5: Commit**

`git commit -m "Give quick jobs a lane of their own, and the long lane a setting"`

---

### Task 2: Limits per household

**Files:**
- Modify: `apps/server/src/services/jobs/runner.ts` (`perHousehold`, counts, `#dueJobs`)
- Modify: the long household kinds' handlers
- Test: `apps/server/src/services/jobs/runner.test.ts`

**Interfaces:**
- Consumes: Task 1's lanes.
- Produces: `JobHandler.perHousehold?: number`: how many of the kind one household runs at once; none means only the kind's own limit.

- [ ] **Step 1: Write the failing tests**

```ts
test("one household's jobs of a kind wait their turn without holding up another's", async () => {
  // kind "import", concurrency 2, perHousehold 1. Home queues two, then
  // Next Door one. With both of Home's held until released: running are
  // one of Home's and Next Door's. expect(runningHouseholds.sort()).toEqual([home, nextDoor].sort())
})

test("a household at its limit for a kind is left out of the look for due work", async () => {
  // kind "nutrition", concurrency 2, perHousehold 1: Home has one running
  // and 60 older queued; Next Door queues one after them. Next Door's runs
  // while Home's first is still held.
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/jobs/runner.test.ts`
Expected: FAIL: both of Home's run; Next Door's waits.

- [ ] **Step 3: Implement**

Count running by `${kind} ${householdId}`. `#tick` skips a job whose household is at the kind's `perHousehold`. `#dueJobs` takes the pairs at their limit and leaves them out with `$nor: [{ kind, forHousehold }, ...]` alongside the `$nin` of kinds. Set `perHousehold: 1` on: `household.import`, `recipes.importFromApp`, `recipes.importLinks`, `discover.search`, `recipes.tidy`, `recipes.nutrition`, `recipes.photos`, `recipes.noteEdit`, the price check, the autoplan and rekeying foods. Webhook deliveries keep only their kind's limit.

No cap on a household's share of a whole lane: most servers are one household, and a cap would leave its slots idle. Each kind's limit, `perHousehold` and the fair-share order already keep one household's imports from blocking another's.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/jobs`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "Limit each household to one job of a kind at a time for imports and library runs"`

---

### Task 3: Stop and time limits for fetches, AI and video tools

**Files:**
- Create: `apps/server/src/services/jobs/stop.ts`
- Modify: `apps/server/src/services/jobs/runner.ts` (runs each job inside `withStopSignal`)
- Modify: `apps/server/src/services/fetch/public-fetch.ts` (signal and errors)
- Modify: `apps/server/src/services/ai/run.ts` (`useAi`: wrapped model, `timeLimitMs`, `ai_timeout`)
- Modify: `apps/server/src/services/ai/media.ts`, `apps/server/src/services/ai/transcribe.ts` or the transcriber in `providers.ts` (abortSignal from `timeLimit`)
- Modify: `apps/server/src/services/recipes/import/video/tools.ts` (`signal` on `execFile`)
- Modify: `apps/server/src/services/recipes/discover/discover.ts` (`timeLimitMs: 5 * 60_000`)
- Test: `apps/server/src/services/jobs/stop.test.ts` (new), `apps/server/src/services/fetch/public-fetch.test.ts`, `apps/server/src/services/ai/run.test.ts`

**Interfaces:**
- Produces: `withStopSignal<T>(signal: AbortSignal, run: () => T): T`; `stopSignal(): AbortSignal | undefined`; `timeLimit(ms: number): AbortSignal` (aborts after `ms`, or when the job running it stops); `useAi` option `timeLimitMs?: number` (default `AI_TIME_LIMIT_MS = 3 * 60_000`); `AppError("upstream", "ai_timeout", "The AI took too long to answer. Try again in a moment.")`.

- [ ] **Step 1: Write the failing tests**

`stop.test.ts`:

```ts
test("a job's stop signal is there for everything it calls, and only for it", async () => {
  const controller = new AbortController()
  expect(stopSignal()).toBeUndefined()
  await withStopSignal(controller.signal, async () => {
    await Promise.resolve()
    expect(stopSignal()).toBe(controller.signal)
  })
  expect(stopSignal()).toBeUndefined()
})

test("a time limit ends when the job stops, with the job's reason", () => {
  const controller = new AbortController()
  withStopSignal(controller.signal, () => {
    const signal = timeLimit(60_000)
    controller.abort(new JobStopped("cancelled"))
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBeInstanceOf(JobStopped)
  })
})
```

`public-fetch.test.ts` (with the local test server it already uses, on a route that never answers):

```ts
test("a stopped job's fetch ends at once with the job's reason, not a time-out", async () => {
  const controller = new AbortController()
  const fetching = withStopSignal(controller.signal, () => fetcher(`${base}/hang`, { homeNetwork: true }))
  controller.abort(new JobStopped("cancelled"))
  await expect(fetching).rejects.toBeInstanceOf(JobStopped)
})
```

`run.test.ts` (with `MockLanguageModelV4` whose `doGenerate` waits on `options.abortSignal`):

```ts
test("an AI call that takes too long gives up, saying so", async () => {
  await expect(useAi(deps, em, { ...options, timeLimitMs: 50 }, (model) => generateText({ model, prompt: "hi" })))
    .rejects.toMatchObject({ code: "ai_timeout" })
})

test("a stopped job's AI call ends with the job's reason", async () => {
  // as above inside withStopSignal; abort with JobStopped("cancelled")
  // expect rejects.toBeInstanceOf(JobStopped)
})
```

In `runner.test.ts`: "a job's handler sees its stop signal" (`stopSignal()` inside `run` is `ctx.signal`).

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/jobs src/services/fetch src/services/ai/run.test.ts`
Expected: FAIL: `stop.ts` doesn't exist; the fetch waits its 15 s; the AI call never ends.

- [ ] **Step 3: Implement**

- `stop.ts`: an `AsyncLocalStorage<AbortSignal>`; `timeLimit` is `AbortSignal.any([AbortSignal.timeout(ms), stop])`, or the timeout alone outside a job. The comment says why: Stop reaches every fetch and AI call a job makes, those added later included, without passing a signal through every function, as `withActor` does for who made a change.
- `runner.ts`: `withActor(MERRAN, () => withStopSignal(controller.signal, () => handler.run(ctx)))`.
- `public-fetch.ts`: `const signal = timeLimit(timeoutMs)`; when the fetch or its body throws and `stopSignal()?.aborted`, rethrow `stopSignal()!.reason` before the time-out check.
- `run.ts`: `useAi` makes `timeLimit(options.timeLimitMs ?? AI_TIME_LIMIT_MS)` and wraps the model (when it isn't a string id) with `wrapLanguageModel` and a `specificationVersion: "v4"` middleware whose `transformParams` combines `params.abortSignal` with it (`AbortSignal.any`), so every call through `useAi` has the limit without each caller passing it. On a throw: the job's reason if it was stopped, `ai_timeout` if the limit passed, else as now. `prepareAi` (the assistant's streamed model) is left: its request's own abort ends it.
- `media.ts` and the transcriber: `abortSignal: timeLimit(...)` on `generateImage`, `generateSpeech` and the transcription call, 3 minutes each.
- `tools.ts`: `signal: stopSignal()` in `execFile`'s options, so Stop kills yt-dlp and ffmpeg; their own time-outs stay.
- `discover.ts`: `timeLimitMs: 5 * 60_000` (it searches the web).

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "Pass Stop to every fetch and AI call a job makes, and give AI calls a time limit"`

---

### Task 4: The household `job` event

**Files:**
- Modify: `apps/server/src/services/events/events.ts` (`LiveEvent` member, `job()` on the bus)
- Modify: `apps/server/src/services/jobs/runner.ts` (`area` on handlers, sends the event; `cancel()`)
- Modify: `apps/server/src/http/routes/events/get.ts` (sends `job`, description)
- Modify: `apps/server/src/http/routes/households/current/jobs/[jobId]/cancel/post.ts`, `apps/server/src/http/routes/settings/server/jobs/[jobId]/cancel/post.ts` (use `jobs.cancel`)
- Modify: the followed kinds' handlers (`area`)
- Regenerate: `apps/server/openapi.json`, both `schema.d.ts`
- Test: `apps/server/src/services/jobs/runner.test.ts`, `apps/server/src/http/routes/events/events.test.ts` (the bus has no test file of its own; its area filter is tested through the stream there)

**Interfaces:**
- Consumes: Task 1's `Running.lane` (unchanged here).
- Produces: `JobHandler.area?: LiveArea` (who hears how a household's job of this kind is going: everyone who may read that area); `LiveEvent` member `{ type: "job"; area: LiveArea; job: JobMoved }` with `type JobMoved = { id: string; kind: string; status: JobStatus; progress: { done: number; total: number } | null }`; `EventBus.job(householdId: string, area: LiveArea, job: JobMoved): void`; `JobRunner.cancel(em: EntityManager, job: Job): Promise<Job>`. The live stream's `job` event has `data` `{ id, kind, status, progress }`.

- [ ] **Step 1: Write the failing tests**

`runner.test.ts`:

```ts
test("tells the household's pages how its job is going: started, moving on and ended", async () => {
  // handler { kind: "import", area: "recipes", run: progress(1, 2), progress(2, 2) }
  // subscribe a listener with areas = all; drain.
  // expect(jobEvents.map((e) => [e.job.status, e.job.progress])).toEqual([
  //   ["running", null], ["running", { done: 1, total: 2 }],
  //   ["running", { done: 2, total: 2 }], ["done", { done: 2, total: 2 }],
  // ])
})

test("a job that will be tried again says it's queued; one stopped by shutdown says nothing", ...)

test("cancelling a waiting job tells the household too", async () => {
  // enqueue; await jobs.cancel(em(), job); expect last event status "cancelled"
})
```

`events.test.ts`: an API key that can't read `household` hears no job event in that area, while one that can does; and over the stream, a `job` event arrives with `{ id, kind, status, progress }` when the household's job moves (use the app's runner and a test handler, or call `events.job` directly as the route test does for changes).

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/jobs src/services/events src/http/routes/events`
Expected: FAIL: no job events.

- [ ] **Step 3: Implement**

- `events.ts`: the `job` member and `job()` method, sent to every listener that may hear the area (no `client` to skip: Merran did it).
- `runner.ts`: `#tell(handler, job, status, progress)` when a household's job of a kind with an `area` is taken (`running`, its saved progress), each time progress is saved, and when a try ends with the status it was saved with (`done`, `failed`, `cancelled`, or `queued` to try again); nothing on shutdown, since it runs again next start. A try saved for a job that was started over (`#endTry` found 0) says `queued`. `cancel(em, job)` calls `cancelJob(em, job, (id) => this.stopJob(id))` and tells the household when a waiting job was cancelled there.
- `get.ts`: `job` events written as `job` with `JSON.stringify(event.job)`; the description gains "- `job` when one of the household's jobs starts, moves on or ends, with its `id`, `kind`, `status` and `progress`. Fetch the job to see more." Both cancel routes call `jobs.cancel(c.var.em, job)`.
- `area`: `"recipes"` on `recipes.importLinks`, `recipes.importFromApp`, `recipes.tidy`, `recipes.nutrition`, `recipes.photos`, `recipes.noteEdit`, `discover.search`; `"household"` on `household.import`; `"list"` on the price check and rekeying foods; `"plan"` on the autoplan.
- Run `pnpm --filter @merran/server openapi`, then both `api` scripts (PowerShell).

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services src/http/routes/events src/http/routes/households src/http/routes/settings`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "Say on the live stream when a household's job starts, moves on and ends"`

---

### Task 5: `GET /households/current/jobs`

**Files:**
- Create: `apps/server/src/http/routes/households/current/jobs/get.ts`
- Modify: `apps/server/src/http/routes/households/current/jobs/index.ts`, `apps/server/src/http/schemas/jobs.ts`, `apps/server/src/services/jobs/jobs.ts`
- Regenerate: `apps/server/openapi.json`, both `schema.d.ts`
- Test: `apps/server/src/http/routes/households/current/jobs/jobs.test.ts`

**Interfaces:**
- Produces: `listHouseholdJobs(em: EntityManager, householdId: string, options?: { status?: JobStatus; limit?: number }): Promise<Job[]>` (newest first, 100 at most); `HouseholdJobListSchema = z.object({ jobs: z.array(JobSchema) }).openapi("HouseholdJobList", ...)`; operationId `listHouseholdJobs`, household admins only (`asHouseholdAdmin`), query `JobListQuerySchema`.

- [ ] **Step 1: Write the failing tests**

```ts
test("a household admin sees the household's jobs, newest first", async () => {
  // two jobs for home, one for next door: GET → home's two, newest first
})
test("only the household's jobs in that status, when asked", async () => { /* ?status=failed */ })
test("someone who isn't a household admin can't see them", async () => { /* 403 */ })
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/households/current/jobs`
Expected: FAIL with 404 (no route).

- [ ] **Step 3: Implement** the service function, schema and route (summary "The household's jobs", description "Household admins only. The household's jobs, newest first, up to 100: imports, library runs, Discover searches and the rest, with how each is going."), registered before `[jobId]`. Run `pnpm --filter @merran/server openapi` and both `api` scripts.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/http`
Expected: PASS, the route layout test included.

- [ ] **Step 5: Commit**

`git commit -m "List a household's jobs for its admins"`

---

### Task 6: The web app follows jobs over the live stream

**Files:**
- Create: `apps/web/src/features/live/jobs.ts`, `apps/web/src/features/live/jobs.test.ts`
- Modify: `apps/web/src/features/live/gather.ts` (gathers keys, `addJob`), `gather.test.ts`
- Modify: `apps/web/src/features/live/state.ts` (`followEvery`), `state.test.ts`
- Modify: `apps/web/src/features/live/live-updates.tsx` (listens for `job`)
- Modify: `apps/web/src/features/recipes/link-imports.ts`, `apps/web/src/features/transfer/queries.ts`, `apps/web/src/features/recipes/ai-photos.ts`, `apps/web/src/features/recipes/tidy/queries.ts`, `apps/web/src/features/household/nutrition-library-card.tsx`, `apps/web/src/features/find/discover-tab.tsx`, `apps/web/src/features/find/queries.ts` (`discoveryQuery`)
- Modify: `apps/web/package.json` (test list adds `src/features/live/jobs.test.ts`)

**Interfaces:**
- Consumes: Task 4's `job` event data `{ id, kind, status, progress }`.
- Produces: `jobRefresh(job: { id: string; kind: string }): QueryKey[]` (always `["jobs", job.id]`, then the kind's keys); `followEvery(ms: number, now?: number): number` (`ms` while the live stream isn't trusted, `FOLLOW_WHILE_LIVE_MS = 30_000` while it is); `gatherChanges(refresh)` returns `{ add(area, byMerran), addJob(job), stop() }`.

- [ ] **Step 1: Write the failing tests**

`jobs.test.ts`:

```ts
test("a job's own query, and what shows its kind", () => {
  assert.deepEqual(jobRefresh({ id: "j1", kind: "recipes.importLinks" }), [["jobs", "j1"], ["link-imports"]])
  assert.deepEqual(jobRefresh({ id: "j2", kind: "recipes.tidy" }), [["jobs", "j2"], ["review", "runs"]])
  assert.deepEqual(jobRefresh({ id: "j3", kind: "something.new" }), [["jobs", "j3"]])
})
```

with the map: `recipes.importLinks` → `["link-imports"]`; `recipes.tidy` → `["review", "runs"]`; `recipes.nutrition` → `["recipes", "nutrition"]`; `recipes.photos` → `["recipes", "photos"]`; `discover.search` → `["recipes", "discover"]`.

`state.test.ts`:

```ts
test("jobs are asked about rarely while the live stream says when they move", () => {
  heardFromLive(1_000)
  assert.equal(followEvery(1_000, 2_000), 30_000)
  assert.equal(followEvery(1_000, 1_000 + 60_000), 1_000) // a minute of nothing
  lostLive()
  assert.equal(followEvery(2_000, 2_000), 2_000)
})
```

`gather.test.ts`:

```ts
test("a job's move refreshes its queries after a second, once however often it moves", ...)
// addJob twice for j1 within the second → refresh called once after 1_000 ms with jobRefresh(j1)
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @merran/web test`
Expected: FAIL: `jobs.ts` and `followEvery` don't exist; `addJob` isn't a function.

- [ ] **Step 3: Implement**

- `gather.ts` keeps keys (by their JSON) rather than areas; `add` adds the area's `LIVE_REFRESH` keys as now; `addJob` adds `jobRefresh(job)` with a person's wait (1 s), since someone is usually watching it.
- `live-updates.tsx`: `source.addEventListener("job", ...)` calls `heardFromLive()` and `changes.addJob(JSON.parse(message.data))`.
- Each job-following query's `refetchInterval` wraps its pace in `followEvery`: `isGoing(data) ? followEvery(1000) : false`, and so on for 2000 and 3000. The server admin's Jobs card keeps its own (its jobs aren't one household's).

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @merran/web test` and `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: See it in a browser.** On a throwaway server running this branch (as for slice 1), import several links and watch the import page: requests to `/api/recipes/import/links/{id}` follow each `job` event, not every second; with the stream cut (server stopped and started), the page polls again.

- [ ] **Step 6: Commit**

`git commit -m "Follow a household's jobs over the live stream, polling only as a fallback"`

---

### Task 7: A link import remembers its progress across a restart

**Files:**
- Modify: `apps/server/src/services/jobs/runner.ts` (`saved` in `JobContext`)
- Modify: `apps/server/src/services/recipes/import/import-links.ts`
- Test: `apps/server/src/services/jobs/runner.test.ts`, `apps/server/src/http/routes/recipes/import/links/links.test.ts`

**Interfaces:**
- Consumes: Task 3 (a stopped fetch throws the job's reason).
- Produces: `JobContext.saved: Record<string, unknown> | null`: what the job saved as it went (its result so far), as it was when this try started.

- [ ] **Step 1: Write the failing tests**

`runner.test.ts`:

```ts
test("a job cut off by a restart sees what it saved so far", async () => {
  // run: progress(1, 2, { done: ["a"] }), then wait on signal; stop() the
  // runner; a new runner's run sees ctx.saved toEqual({ done: ["a"] })
})
```

`links.test.ts`:

```ts
test("an import cut off by a restart carries on from the link it was on", async () => {
  // two links; the fake fetcher holds the second until released. After the
  // first is added, stop the runner (shutdown) and start a new one.
  // expect items: [added (the same recipe id as before), added]; already: 0
})

test("a link stopped mid-fetch shows as stopped, not failed", async () => {
  // cancel while the fake fetcher holds the first link → status cancelled,
  // items[0].state "stopped", failed 0
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services/jobs/runner.test.ts src/http/routes/recipes/import/links`
Expected: FAIL: `saved` is undefined; the first link comes back as "already".

- [ ] **Step 3: Implement**

`runner.ts` passes `saved: job.result ?? null`. `import-links.ts`: when `SoFar` parses from `saved` with the same links in the same order, items already `added`, `already` or `failed` keep their state and recipe and are skipped, and `done` starts at their count; an item left `adding` is tried again (a recipe it finished just before the restart shows as already there, which is rare and harmless). In the per-link `catch`, a `JobStopped` (or `signal.aborted`) is rethrown rather than recorded as the link failing.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @merran/server exec vitest run --project sqlite src/services src/http/routes/recipes`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "Carry a link import on from where it was after a restart"`

---

### Task 8: Docs, and the whole check

**Files:**
- Modify: `docs/performance.md` (What slice 2 built, the decisions made while building it, findings 2–6, 8 and 10 marked, slice 2's row), `docs/platform.md` (Jobs: lanes and their setting, one of a kind per household, Stop reaching fetches and AI, time limits, who sees a household's jobs, the `job` event; the table's per-household line made true; weekly classics and prep reminders marked as not yet jobs), `docs/stack.md` (jobs are taken by a conditional update, right for one process, not `SKIP LOCKED`), `docs/features.md` ("Background jobs that survive restarts, with a jobs page": what's built, the household's page still to come with slice 3)

- [ ] **Step 1: Write the docs**, dated November 15, 2026.
- [ ] **Step 2: Run the whole check**

Run: `pnpm typecheck`, `pnpm format:check`, `pnpm --filter @merran/server test`, `pnpm --filter @merran/web test`, `pnpm --filter @merran/shared test`, `pnpm --filter @merran/docs settings:generate` (no change), and confirm `apps/web/src/lib/api/schema.d.ts` and `apps/extension/src/lib/schema.d.ts` are identical.
Expected: all pass.

- [ ] **Step 3: Commit**

`git commit -m "Note slice 2 as built"`
