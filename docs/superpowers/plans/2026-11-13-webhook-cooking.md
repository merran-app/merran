# Cooking and Timer Webhooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cook view tells the server when cooking starts and ends and about each timer, so a webhook hears `cooking.started`, `cooking.ended`, `timer.started`, `timer.extended`, `timer.finished` and `timer.cancelled`, and Home Assistant can read who's cooking with `GET /api/cooking/sessions`.

**Architecture:** Two household-scoped tables, `cooking_sessions` and `cooking_timers`, behind routes under `apps/server/src/http/routes/cooking/sessions/`. A service in `apps/server/src/services/cooking/` starts, checks in and ends sessions and sets timers, recording each event with `record()` in the same transaction. Three jobs: one keyed job per timer at its end (`cooking.timerDone`), one keyed job a minute after cook view's page goes away (`cooking.closeSession`), and a sweep every 5 minutes (`cooking.endQuiet`). In the web app, a hook in cook view reports the session, and the app-wide timer store reports its timers, both dropping any call that fails.

**Tech Stack:** Hono + `@hono/zod-openapi`, MikroORM (SQLite and Postgres), the job runner in `services/jobs/`, React with openapi-fetch, `node:test` for web unit tests, Vitest for the server.

**Spec:** [docs/webhooks.md](../../webhooks.md): "Decisions" (the Cooking row and the rulings dated November 12, 2026, added in Task 1), "Events → Slice 2: cooking" and "Cooking sessions and timers".

## Global Constraints

- Every rule in [AGENTS.md](../../../AGENTS.md) applies: routes mirror the API, words people read live in `apps/web/src/locales/en.json`, styles use logical classes, code is written to be read.
- Cook view's reports never get in the way of cooking: a call that fails is dropped and never retried or queued, and nothing in cook view waits on one.
- Guests cooking from a shared link never report.
- Timers are sent as seconds left; the server works out when they end.
- A session with no word from cook view for 30 minutes and no timer running ends as `timed_out`; so does any session still open 12 hours after it started.
- Leaving cook view with a timer running ends the session (`stopped`) only when its last running timer finishes or is cancelled (decided November 12, 2026).
- Closing or reloading the page ends the session a minute later, unless cook view checks in again (decided November 12, 2026).
- Made it ends the session at once (`made`), even with timers running; the timers still send `timer.finished`.
- Each new pickable event needs its `EVENT_TEXT` entry in `event-picker.tsx` and `events.*`, `chips.*` and `eventHints.*` strings in `en.json`. Cooking is its own area; `meal.cooked` and `meal.skipped` stay under Plan.
- Sessions and timers are kept while webhooks are turned off; only `record()` checks the module.

## Review Focus

1. **A reload in the middle of cooking.** `pagehide` sends the beacon, then the page comes back and checks in within the minute: no `cooking.ended`, no second `cooking.started`. Test in Task 4 (`check-in clears a close that's coming`).
2. **+1 minute on a timer that has already gone off.** The timer runs again for a minute and sends `timer.extended`, then `timer.finished` again. Test in Task 5 (`+1 minute on a finished timer runs it again`).
3. **Someone else's session id.** A household member or API key sending another cook's session id gets 404 and changes nothing; Made it with it still succeeds. Tests in Tasks 4 and 6.
4. **A recipe moved to Recently deleted while it's being cooked.** Events still name it, rather than failing. Test in Task 4 (`a recipe deleted mid-cook still names it`).
5. **The last timer of a session that was left is cancelled, not finished.** The session ends then, as `stopped`. Test in Task 5 (`cancelling the last timer ends a session that was left`).

---

### Task 1: Record the decisions

**Files:**
- Modify: `docs/webhooks.md` (the Decisions table, "Cooking sessions and timers", "Data")

- [ ] **Step 1: Add dated rows to the Decisions table**, after "A compact form":
  - *Leaving with timers running (November 12, 2026):* leaving cook view any way (Exit, Back, a link elsewhere) ends the session at once when no timer is running; otherwise `cooking.ended` (`stopped`) is sent when its last running timer finishes or is cancelled. Why: a running timer means something is still on the stove.
  - *Closing the page (November 12, 2026):* `pagehide` sends a beacon that ends the session a minute later unless cook view checks in again, so a reload carries on with the same session; coming back to the same recipe on the same device while its timers run picks the session up again with no second `cooking.started`.
  - *Made it (November 12, 2026):* both Made it routes (`POST /api/recipes/{recipe}/made` and `PATCH /api/plan/entries/{entryId}` setting `cooked`) take an optional `session`; a session that's gone, ended or someone else's is ignored, so Made it never fails for a report. Made it ends the session at once even with timers running. `meal.cooked` is recorded first, then `cooking.ended`, in the same request.
  - *Timer reports come from the timer store (November 12, 2026):* timers keep counting and ringing anywhere in the app, so +1 minute and cancel report from wherever they're pressed. Dismissing a finished timer sends nothing.
  - *Who ends it (November 12, 2026):* a session belongs to its cook; others in the household, and keys with plan read access, can read it, but only the cook can change it. When Merran ends a session (the grace minute, the last timer, the 30-minute and 12-hour limits) it's `by: null`, `via: "merran"`, and `cook` names who was cooking.
  - *A pairing (November 12, 2026):* cooked with a pairing, cooking events carry the main recipe, and `with` for the other.
- [ ] **Step 2: Update "Cooking sessions and timers"** to match the routes in Tasks 4 to 6 (`POST /end` takes `{ "soon": true }` for the beacon), and "Data" to list the session's `leftAt` and `closingAt`.
- [ ] **Step 3: Commit** `docs/webhooks.md` and this plan: "Plan cooking and timer webhooks".

### Task 2: The events in the catalog, their payloads, and the picker

**Files:**
- Modify: `packages/shared/src/webhooks/events.ts`, `packages/shared/src/webhooks/events.test.ts`
- Modify: `apps/server/src/services/webhooks/payloads.ts`
- Modify: `apps/web/src/features/household/webhooks/event-picker.tsx`, `apps/web/src/locales/en.json`

**Interfaces:**
- Produces: `WEBHOOK_AREAS` = `["recipes", "cooking", "plan", "list", "pantry", "webhooks"]`; six events with `area: "cooking"`, `pickable: true`, in this order after `review.waiting`: `cooking.started`, `cooking.ended`, `timer.started`, `timer.extended`, `timer.finished`, `timer.cancelled`.
- Produces in `events.ts`: `COOKING_OUTCOMES = ["made", "stopped", "timed_out"] as const` and `type CookingOutcome`, for the payloads and the table.
- Produces in `payloads.ts`: `TimerRefSchema` (`{ id: string, label: string, seconds: int ≥ 1, endsAt: string }`); payload shapes:
  - `cooking.started`: `{ cook: named | null, session: { id }, recipe: RecipeRef, with: RecipeRef | null, meal: MealRef | null, servings: number | null }`
  - `cooking.ended`: `{ cook, session, recipe, with, outcome: COOKING_OUTCOMES, minutes: int ≥ 0 }`
  - each `timer.*`: `{ cook, session, recipe, timer: TimerRef }`
- `contextExample` returns the Merran context for `timer.finished` and `cooking.ended` (the example's outcome is `timed_out`).

- [ ] **Step 1: Write the failing test** in `events.test.ts`: `"cooking has its own area, before the plan"` asserting `WEBHOOK_AREAS.indexOf("cooking") === 1` and that the six types above are pickable with area `cooking`, and `meal.cooked` stays in `plan`.
- [ ] **Step 2: Run** `pnpm --filter @merran/shared test`. Expected: FAIL.
- [ ] **Step 3: Add the area and events** to `events.ts`.
- [ ] **Step 4: Add the payload schemas, examples and `WEBHOOK_SUMMARIES`** to `payloads.ts`. `seconds` is described as "How long it runs, in seconds: its length when started, with each minute added." `minutes` is "How long cooking went on, in whole minutes."
- [ ] **Step 5: Add the picker text.** `EVENT_TEXT` entries, and in `en.json` under `settings.household.webhooks`: `areas.cooking` "Cooking"; `events.cooking.{started,ended}` "Cooking starts", "Cooking ends"; `events.timer.{started,extended,finished,cancelled}` "A timer starts", "A timer gets more time", "A timer is done", "A timer is cancelled"; `chips.cooking` "Started", "Ended"; `chips.timer` "Timer started", "More time", "Timer done", "Timer cancelled"; `eventHints.cooking.started` "Someone leaves Get ready in cook view."; `eventHints.cooking.ended` "Made it, leaving cook view once its timers are done, or no word for 30 minutes."; `eventHints.timer.started` "A step's time, or a new timer, in cook view."; `eventHints.timer.extended` "+1 minute, in cook view or on its message."; `eventHints.timer.finished` "Time's up. Sent by the server, even if the screen is off."; `eventHints.timer.cancelled` "Cancelled before it went off."
- [ ] **Step 6: Run** `pnpm --filter @merran/shared test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 7: Commit**: "Add cooking and timer events to the catalog".

### Task 3: The tables

**Files:**
- Create: `apps/server/src/database/entities/cooking_sessions.ts`, `apps/server/src/database/entities/cooking_timers.ts`
- Modify: `apps/server/src/database/entities/index.ts`
- Create (generated): the SQLite and Postgres migrations from `pnpm --filter @merran/server db:migration cooking-sessions`

**Interfaces:**
- Produces `CookingSession` (`cooking_sessions`): `id`; `household`; `cook` (User, nullable, `set null`); `recipe` (Recipe, `cascade`, indexed); `paired` (Recipe, nullable, `set null`); `entry` (PlanEntry, nullable, `set null`); `servings` (double, nullable); `startedAt` (`createdAt()`); `heardAt` (datetime); `leftAt`, `closingAt`, `endedAt` (datetime, nullable); `outcome` (`p.enum(COOKING_OUTCOMES).nullable()`, from `@merran/shared`); `updatedAt`. Index `["household", "endedAt"]`. Household filter.
- Produces `CookingTimer` (`cooking_timers`): `id`; `household`; `session` (CookingSession, `cascade`, indexed); `timerId` (string, cook view's id); `label` (string); `seconds` (integer); `endsAt` (datetime); `state` (enum `running | finished | cancelled`, default `running`); `createdAt`; `updatedAt`. Unique `["session", "timerId"]`. Household filter.

- [ ] **Step 1: Write the entities** and list both in `entities`.
- [ ] **Step 2: Make the migrations** with `pnpm --filter @merran/server db:migration cooking-sessions`, and read both: the SQLite one must keep its enum checks (the generator drops them; add them by hand as earlier migrations do), and the Postgres one needs the indexes on `session` and `recipe`.
- [ ] **Step 3: Run** `pnpm --filter @merran/server exec vitest run --project sqlite src/database` (the schema test and migrations test). Expected: PASS.
- [ ] **Step 4: Commit**: "Add cooking sessions and timers tables".

### Task 4: Sessions: start, check in, leave, close and list

**Files:**
- Create: `apps/server/src/services/cooking/sessions.ts`, `apps/server/src/services/cooking/events.ts`
- Create: `apps/server/src/http/schemas/cooking.ts`
- Create: `apps/server/src/http/routes/cooking/index.ts`, `cooking/sessions/{index,get,post}.ts`, `cooking/sessions/[sessionId]/{index,patch}.ts`, `cooking/sessions/[sessionId]/end/{index,post}.ts`
- Modify: `apps/server/src/http/routes/index.ts`, `apps/server/src/services/jobs/handlers.ts`
- Test: `apps/server/src/http/routes/cooking/sessions/sessions.test.ts`

**Interfaces:**
- Produces in `services/cooking/sessions.ts`:
  - `startSession(em, householdId, cookId: string, input: { recipe: string; with?: string | null; meal?: string | null; servings?: number | null }): Promise<CookingSession>`; records `cooking.started`.
  - `checkIn(em, householdId, cookId, sessionId, changes: { servings?: number | null }): Promise<CookingSession>`; sets `heardAt`, clears `leftAt` and `closingAt`, cancels the session's close job. 404 `cooking_session_not_found` ("There's no such cooking session, or it's ended.") for one that's ended, or not this cook's.
  - `leaveSession(em, householdId, cookId, sessionId, { soon: boolean }): Promise<CookingSession>`: `soon` sets `closingAt` a minute on and queues `cooking.closeSession` (key `cooking.close:<sessionId>`, payload `{ sessionId }`); otherwise `endIfIdle`.
  - `endIfIdle(em, householdId, session, actor?: Actor)`: ends it `stopped` when no timer is running, else sets `leftAt`.
  - `endSession(em, householdId, session, outcome, actor?: Actor)`: sets `endedAt` and `outcome`, cancels the close job, records `cooking.ended`.
  - `openSessions(em): Promise<CookingSession[]>` and `describeSession(em, session)` for responses.
  - `closeSessionJob: JobHandler` (kind `cooking.closeSession`): if the session is open and `closingAt` has passed, `endIfIdle` as Merran.
- Produces in `services/cooking/events.ts`: `cookingContext(em, session)` returning `{ cook, session: { id }, recipe, with }`, loading recipes with the not-deleted filter off (`filters: { [NOT_DELETED_FILTER]: false }`); `recordCookingStarted`, `recordCookingEnded`, `recordTimerEvent(em, householdId, type, timer, actor?)`. Each asks `wantsEvent` first, so a household without webhooks pays nothing.
- Produces in `schemas/cooking.ts`: `CookingSessionParam` (`sessionId`, uuid), `NewCookingSessionSchema`, `CookingSessionChangesSchema` (`servings` positive ≤ 1000, nullable, optional), `LeaveCookingSchema` (`soon` boolean, optional), `CookingSessionSchema` (`id`, `cook`, `recipe` and `with` as `RecipeRefSchema`, `meal` as `MealRefSchema` nullable, `servings`, `startedAt`, `heardAt`, `leaving` boolean (`leftAt` or `closingAt` set), `endedAt`, `outcome`, `timers`: running ones as `TimerRefSchema`), `CookingSessionsSchema` (`{ sessions }`).
- Routes: `GET /api/cooking/sessions` (`openToKeys("plan", "read")`, open sessions, oldest first); `POST /api/cooking/sessions` (`plan` write, 201); `PATCH /api/cooking/sessions/{sessionId}` (`plan` write, 200 or 404); `POST /api/cooking/sessions/{sessionId}/end` (`plan` write, 200 or 404). An unknown `recipe`, `with` or `meal` in POST is 404.

- [ ] **Step 1: Write the failing tests** in `sessions.test.ts`, with `listenToEverything` and `eventsFrom` from `src/test/webhooks.ts`:
  - `starting sends cooking.started` with `cook.name`, `recipe.slug`, `with`, `meal.entryId` and `servings` as sent; `GET` lists it with `leaving: false`.
  - `check-in changes servings and sends nothing`.
  - `leaving with no timer ends it` → one `cooking.ended`, `outcome: "stopped"`, `by.name` is the cook, `via: "app"`; GET lists nothing.
  - `check-in clears a close that's coming`: end with `{ soon: true }`, then PATCH; run due jobs with the close job's `runAt` moved to now and `closingAt` to the past; no `cooking.ended`.
  - `a close that comes ends it as Merran`: end with `{ soon: true }`, move the job and `closingAt` back, drain → `outcome: "stopped"`, `by: null`, `via: "merran"`, `cook.name` set.
  - `another cook's session is 404`: a second member PATCHes and ends Kyle's session → 404 each, and it's still open.
  - `API keys`: a key with plan read can GET but gets 403 on POST; one with plan write can POST.
  - `signed out is 401`, so guests never report.
  - `a recipe deleted mid-cook still names it`: start, `DELETE /api/recipes/{id}`, end → `cooking.ended` carries `recipe.title`.
- [ ] **Step 2: Run** `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/cooking`. Expected: FAIL (404s).
- [ ] **Step 3: Implement** the service, schemas and routes, register `cookingRoutes` in `routes/index.ts`, and `closeSessionJob` in `JOB_HANDLERS`. Writes go through `inHouseholdTransaction`, with the session row locked (`PESSIMISTIC_WRITE`) so a close and a check-in can't cross.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit**: "Start, check in on and end cooking sessions".

### Task 5: Timers

**Files:**
- Create: `apps/server/src/services/cooking/timers.ts`
- Create: `apps/server/src/http/routes/cooking/sessions/[sessionId]/timers/index.ts`, `timers/[timerId]/{index,put,delete}.ts`
- Modify: `apps/server/src/http/schemas/cooking.ts`, `apps/server/src/services/jobs/handlers.ts`
- Test: `apps/server/src/http/routes/cooking/sessions/timers.test.ts`

**Interfaces:**
- Consumes: `endIfIdle`, `recordTimerEvent` from Task 4.
- Produces in `services/cooking/timers.ts`:
  - `setTimer(em, householdId, cookId, sessionId, timerId, input: { label: string; seconds: number }): Promise<CookingTimer>`. New timer: needs an open session; `seconds` is the length; `timer.started`. Existing timer: `endsAt` = now + seconds left; `seconds` grows by how far `endsAt` moved (for a finished one, by the seconds left); state back to `running`; `timer.extended`. Its job (`cooking.timerDone`, key `cooking.timer:<row id>`, payload `{ timerId: row id }`) is moved, or a new one made when none is queued. At most 20 running timers a session: 409 `too_many_timers`.
  - `cancelTimer(em, householdId, cookId, sessionId, timerId): Promise<void>`: a running timer is `cancelled`, its job cancelled, `timer.cancelled` recorded, then `endIfIdle` if the session was left. A finished or cancelled one changes nothing. An ended session's timers can still be changed; a missing one is 404 `cooking_timer_not_found`.
  - `timerDoneJob: JobHandler` (kind `cooking.timerDone`): when the timer is still running and `endsAt` has passed, marks it `finished`, records `timer.finished` as Merran, and ends a left session that has no timer running. A timer whose `endsAt` moved later does nothing; its moved job will come.
- Produces in `schemas/cooking.ts`: `CookingTimerParam` (`sessionId` uuid, `timerId` matching `^[A-Za-z0-9_-]{1,64}$`), `TimerSettingSchema` (`label` trimmed 1–200, `seconds` int 1–86400).
- Routes: `PUT /api/cooking/sessions/{sessionId}/timers/{timerId}` (`plan` write, 200 with `TimerRefSchema`); `DELETE …/timers/{timerId}` (`plan` write, 204).

- [ ] **Step 1: Write the failing tests**, with a helper `finishTimersNow()` that moves running timers' `endsAt` and queued `cooking.timerDone` jobs' `runAt` to now and drains the runner:
  - `starting a timer sends timer.started` with `timer.id`, `label`, `seconds: 600` and an `endsAt` 600 seconds from the request.
  - `seconds left are counted from the server's clock`: `endsAt` is within 2 seconds of now + seconds, whatever the device's clock.
  - `+1 minute sends timer.extended` with `seconds: 660` and `endsAt` a minute later, and only one queued job for the timer.
  - `the server sends timer.finished` with `by: null`, `via: "merran"` and `cook.name`.
  - `+1 minute on a finished timer runs it again`: finish, PUT 60 → `timer.extended`, then `timer.finished` again.
  - `cancelling sends timer.cancelled, and no timer.finished` after `finishTimersNow()`.
  - `dismissing a finished timer sends nothing`: DELETE after it finished → 204 and no event.
  - `leaving waits for the last timer`: two timers, leave → no `cooking.ended`; finish one → none; finish both → one `cooking.ended`, `stopped`, as Merran.
  - `cancelling the last timer ends a session that was left`.
  - `a new timer on an ended session is 404`, while +1 on an existing one still works.
  - `another cook's timer is 404`.
- [ ] **Step 2: Run** `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/cooking`. Expected: FAIL.
- [ ] **Step 3: Implement** the service, schemas and routes, and add `timerDoneJob` to `JOB_HANDLERS`.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit**: "Keep cooking timers on the server and send timer events".

### Task 6: Sessions that go quiet, Made it, and the clean-up

**Files:**
- Create: `apps/server/src/services/cooking/quiet.ts`, `apps/server/src/services/cooking/clean-up.ts`
- Modify: `apps/server/src/services/jobs/handlers.ts` (`endQuietSessionsJob` in `JOB_HANDLERS`, `{ kind: "cooking.endQuiet", cron: "*/5 * * * *" }` in `JOB_SCHEDULES`), `apps/server/src/services/jobs/clean-up.ts`
- Modify: `apps/server/src/http/schemas/recipes.ts` (`MadeSchema`), `apps/server/src/http/schemas/plan.ts` (`PlanEntryChangesSchema`), `apps/server/src/http/routes/recipes/[recipe]/made/post.ts`, `apps/server/src/http/routes/plan/entries/[entryId]/patch.ts`
- Test: `apps/server/src/http/routes/cooking/sessions/ending.test.ts`

**Interfaces:**
- Consumes: `endSession` from Task 4.
- Produces: `endQuietSessionsJob: JobHandler` (kind `cooking.endQuiet`): across households, ends as `timed_out` (Merran) each open session whose `heardAt` is over 30 minutes old with no timer running, each started over 12 hours ago, and, as `stopped`, each left session with no timer running. `QUIET_MINUTES = 30`, `LONGEST_HOURS = 12`.
- Produces: `madeInSession(em, householdId, cookId, sessionId): Promise<void>` in `sessions.ts`: ends that cook's open session as `made`; does nothing for a missing, ended or other cook's session; logs and swallows any error, so Made it never fails.
- Produces: `clearOldCookingSessions(em): Promise<number>`: deletes sessions that ended, or started, over 30 days ago (their timers go by the foreign key). The daily clean-up returns it as `cookingSessions`.
- `MadeSchema` and `PlanEntryChangesSchema` gain `session: z.uuid().optional()`, described as "The cooking session it was made in, from cook view. It ends, as made."; the plan route only uses it when the change marks the meal cooked.

- [ ] **Step 1: Write the failing tests:**
  - `no word for 30 minutes ends it as timed_out`: set `heardAt` 31 minutes back, run the job → `cooking.ended` with `outcome: "timed_out"`, `minutes` ≥ 0, `via: "merran"`.
  - `a running timer keeps a quiet session open`.
  - `12 hours ends it, timers or not`.
  - `Made it off the plan ends it as made`: `POST /api/recipes/{id}/made` with `session` → `meal.cooked`, then `cooking.ended` with `outcome: "made"`, in that order.
  - `Made it on the plan ends it as made`: `PATCH /api/plan/entries/{id}` with `status: "cooked"` and `session`.
  - `Made it with timers running ends it, and they still finish`.
  - `Made it with someone else's session still makes it` → 200 and their session stays open.
  - `the clean-up clears sessions after 30 days`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** the job, the clean-up and the Made it changes.
- [ ] **Step 4: Run the whole cooking folder, and the made and meals tests:** `pnpm --filter @merran/server exec vitest run --project sqlite src/http/routes/cooking "src/http/routes/recipes/[recipe]/made" src/services/webhooks`. Expected: PASS.
- [ ] **Step 5: Commit**: "End quiet cooking sessions, and end them with Made it".

### Task 7: The API reference and clients

**Files:**
- Regenerated: `apps/server/openapi.json` (wherever `pnpm --filter @merran/server openapi` writes), `apps/web/src/lib/api/schema.d.ts`, `apps/extension/.../schema.d.ts`

- [ ] **Step 1: Run** `pnpm --filter @merran/server openapi`, then the web and extension `api` scripts (in PowerShell with `pnpm_config_cache_dir` in `.local/`, as the dlx cache needs on this machine).
- [ ] **Step 2: Check** the two `schema.d.ts` files match, and the spec's `webhooks` section lists the six new events.
- [ ] **Step 3: Commit**: "Regenerate the API reference and clients for cooking".

### Task 8: Cook view reports

**Files:**
- Create: `apps/web/src/features/cook/reports/remembered.ts`, `remembered.test.ts` (which session a cooking is in, kept per device)
- Create: `apps/web/src/features/cook/reports/timer-report.ts`, `timer-report.test.ts` (what a timer change tells the server)
- Create: `apps/web/src/features/cook/reports/send.ts` (the calls, through `api`, every failure dropped)
- Create: `apps/web/src/features/cook/reports/use-cooking-session.ts` (the hook)
- Modify: `apps/web/src/features/cook/timers.tsx`, `apps/web/src/features/cook/cook-view.tsx`, `apps/web/package.json` (`test` lists the two new tests)

**Interfaces:**
- `remembered.ts`: `rememberSession(progressId: string, sessionId: string)`, `rememberedSession(progressId: string): string | null` (kept 12 hours, like progress, under `merran-cooking-session.<progressId>`), `forgetSession(progressId: string)`.
- `timer-report.ts`: `type TimerReport = { kind: "set"; label: string; seconds: number } | { kind: "cancel" }`; `timerReport(before: Timer | undefined, after: Timer | undefined, now: number): TimerReport | null`: a timer added or moved is `set` with `seconds` = `Math.max(1, Math.ceil((after.endsAt - now) / 1000))`; one taken away while running is `cancel`; one taken away after it went off, or with no session, is `null`.
- `Cooking` in `timers.tsx` gains `session?: string`. `startTimer`, `addMinute` and `dismissTimer` send `timerReport` for the timer they change, to `timer.cooking.session`.
- `send.ts`: `startCooking(body): Promise<string | null>`, `checkIn(sessionId, servings?): Promise<"open" | "gone" | "failed">` ("gone" only on 404), `leave(sessionId)`, `closeSoon(sessionId)` (`navigator.sendBeacon` with a JSON `Blob` of `{ "soon": true }`), `sendTimer(sessionId, timerId, report)`, all catching every error.
- `useCookingSession({ enabled, started, progressId, recipeId, pairedId, mealId, servings }): { sessionId: string | null; made(): void }`:
  - When `started` turns true: check in on the remembered session; if it's gone, or there's none, start one and remember it.
  - Checks in every 5 minutes while the page is visible, when it becomes visible again, on `pageshow` from the back-forward cache, and when servings change; a check-in that finds it gone starts a new one.
  - `pagehide` sends `closeSoon`. Unmounting sends `leave`, deferred one task so React's development double-mount doesn't end and restart it, and skipped after `made()`.
- `cook-view.tsx`: `enabled` is `household`; `started` is `!onPrep` (so a recipe with nothing to get ready starts at once); `cooking.session` is the hook's `sessionId`; `finish()` adds `session` to both Made it calls and calls `made()` after they succeed.

- [ ] **Step 1: Write the failing tests** in `remembered.test.ts` (`a remembered session is kept per cooking and forgotten after 12 hours`) and `timer-report.test.ts` (`starting is set with its seconds`, `+1 minute is set with the seconds now left`, `cancelling a running timer is cancel`, `dismissing a finished timer is nothing`, `a timer with no session is nothing`).
- [ ] **Step 2: Run** `pnpm --filter @merran/web test`. Expected: FAIL.
- [ ] **Step 3: Implement** the four files and the changes to `timers.tsx` and `cook-view.tsx`.
- [ ] **Step 4: Run** `pnpm --filter @merran/web test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**: "Report cooking and timers from cook view".

### Task 9: Docs and guides

**Files:**
- Modify: `docs/features.md` (the Webhooks row), `docs/webhooks.md` (status line at the top, "Build order")
- Modify: `apps/docs/src/content/docs/docs/integrations/webhooks.md` (the cooking events with a sample, `GET /api/cooking/sessions`, a Home Assistant example turning on the hood fan with `cooking.started` and off with `cooking.ended`, and one announcing `timer.finished` on a speaker)
- Modify: `apps/docs/src/content/docs/docs/use/cooking.md` (what cook view tells Merran, and that guests' cooking stays theirs)

- [ ] **Step 1: Write the docs.** Guides quote the app's labels exactly, and describe main as released.
- [ ] **Step 2: Run** `pnpm docs:build`. Expected: PASS, every link checked.
- [ ] **Step 3: Commit**: "Document cooking and timer webhooks".

### Task 10: Check everything and open the pull request

- [ ] **Step 1: Run** `pnpm --filter @merran/server test:all` (SQLite and Postgres; `db:test-postgres` first), `pnpm --filter @merran/shared test`, `pnpm --filter @merran/web test`, `pnpm --filter @merran/web check:locales`, `pnpm typecheck`, `pnpm format:check`, `pnpm --filter @merran/extension build`. Expected: all pass.
- [ ] **Step 2: Check in the browser** on a worktree server, as my admin account in the dev household: add a webhook that wants the Cooking area; in cook view, leave Get ready, start a timer, +1 minute, cancel one, let one finish, reload in the middle, leave with a timer running, then Made it. The deliveries log shows each event once, in order, and the network panel shows the beacon on reload with no `cooking.ended` after it.
- [ ] **Step 3: Push and open** `feat: cooking and timer webhooks` on main, with the plan linked.
