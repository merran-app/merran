# A model for photos and PDFs: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A household, and the server as a default, can pick one model that every AI call with a photo or PDF in it uses.

**Architecture:** `HouseholdAi` and `AiPolicy` gain `vision`. `resolveAi` takes `visual` and puts the household's `vision` pick ahead of its task and size picks, and the server's `vision` default ahead of its size default. `useAi` and `prepareAi` work out `visual` from the `needs` every feature already passes, so no feature code changes. Settings get a third picker.

**Tech Stack:** TypeScript, Hono with zod-openapi, MikroORM, AI SDK 7, Vitest, React with i18next.

**Spec:** [docs/superpowers/specs/2026-11-09-photos-pdfs-model-design.md](../specs/2026-11-09-photos-pdfs-model-design.md)

## Global constraints

- Work in `D:\Development\Mise\.claude\worktrees\photos-pdfs-model`, branch `feat/photos-pdfs-model`. Never touch the main checkout or the user's dev servers on ports 3000 and 5173.
- The field is `vision` everywhere in code and the API. People read "Photos and PDFs".
- No migration and no environment variable: both settings are stored as JSON and filled in from their defaults.
- Words people read go in `apps/web/src/locales/en.json`, quoted exactly in the guide.
- Match the code around you: plain-English comments that say why, normal line breaks, named helpers.
- Run Prettier from the root (`pnpm format`), never on `docs/`.
- Run the `api` scripts in PowerShell with `$env:pnpm_config_cache_dir = "D:\Development\Mise\.local\pnpm-cache"`.
- Every commit ends with `Co-authored-by: bula87 <bula87@gmail.com>` and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- TDD: write each test, watch it fail for the right reason, then write the code.

## Review focus

1. **Settings saved before this change** have no `vision`. Reading them must give `vision: null`, and calls must go where they went before. Pinned in Task 2.
2. **A Photos and PDFs model whose key is gone** (removed, or the provider's only key out of credit) must make photo calls say why, not quietly use the task's model. The status must say why too. Pinned in Tasks 1 and 2.
3. **A PDF with no photo** (`needs` has `"pdfs"` only) is a photo or PDF call. Pinned in Task 3.
4. **An assistant chat after its photo:** a text-only message later in that chat still has the photo in its history, so it stays on the Photos and PDFs model. A new chat doesn't. Pinned in Task 3.
5. **Only the Photos and PDFs model picked:** **Use the suggested models** must show, and clear it. Checked in Task 4's browser check.

---

### Task 1: Resolution picks the Photos and PDFs model

**Files:**
- Modify: `packages/shared/src/ai/policy.ts` (`AiPolicy`, `DEFAULT_AI_POLICY`, `HouseholdAi`, `NO_HOUSEHOLD_AI`)
- Modify: `packages/shared/src/ai/resolve.ts` (`ResolveInput`, `resolveAi`)
- Test: `packages/shared/src/ai/ai.test.ts`

**Interfaces:**
- Produces:
  - `HouseholdAi.vision: ModelRef | null`, with `NO_HOUSEHOLD_AI.vision = null`. Comment: the model for every photo and PDF, ahead of the task's own; null to go by the task's.
  - `AiPolicy.vision: ModelRef | null`, with `DEFAULT_AI_POLICY.vision = null`. Comment: the model for photos and PDFs in households that haven't picked, on the server's keys.
  - `ResolveInput.visual?: boolean`. Comment: the call has photos or PDFs in it.

- [ ] **Step 1: Write the failing tests**

Add `describe("photos and PDFs", ...)` after "whose key pays" in `ai.test.ts`, using its `input()` and `key()` helpers. The refs: Haiku `"anthropic:claude-haiku-5-5"`, Sonnet `"anthropic:claude-sonnet-5-5"`, Opus `"anthropic:claude-opus-5-5"`, Fable `"anthropic:claude-fable-5-1"`.

- `"go to the household's Photos and PDFs model, over the task's own pick"`:
  - `ai = { ...NO_HOUSEHOLD_AI, large: Sonnet, tasks: { import: Fable }, vision: Haiku }`.
  - With `visual: true`, expect `{ ok: true, ref: Haiku }`.
  - Without it, expect `ref: Fable`.
- `"otherwise go by the task's pick, then the size's"`:
  - `ai = { ...NO_HOUSEHOLD_AI, large: Sonnet, tasks: { import: Fable } }`.
  - `visual: true` gives `ref: Fable`.
  - `task: "tidy", visual: true` gives `ref: Sonnet`.
- `"get the server's default only when the household's picked nothing for the call"`:
  - `policy = { ...DEFAULT_AI_POLICY, large: Opus, vision: Haiku }`.
  - `visual: true` gives `ref: Haiku`.
  - Without `visual`, `ref: Opus`.
  - With a household that picked `large: Sonnet`, `visual: true` gives `ref: Sonnet`.
- `"come after the household's own keys"`:
  - The household has `key("home-openai", "household", "openai")`, and `policy.vision` is Haiku.
  - `visual: true` gives `{ key: { id: "home-openai" }, ref: "openai:gpt-6-sol" }`.
- `"say why when the Photos and PDFs model can't run, rather than use another"`:
  - `ai = { ...NO_HOUSEHOLD_AI, large: Sonnet, vision: "openai:gpt-6-sol" }`. The server has only its Claude key.
  - `visual: true` gives `toEqual({ ok: false, why: "noKey" })`.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @merran/shared test`
Expected: the new tests fail, picking Fable or Opus where Haiku is wanted. Typecheck errors on `vision` and `visual` are not the failure wanted: add the fields first if Vitest refuses to run.

- [ ] **Step 3: Implement**

Add the fields above. In `resolveAi`, work out the pick and the candidates like this:

```ts
const picked =
  (input.visual ? household.ai.vision : null) ??
  household.ai.tasks[task] ??
  household.ai[size]
const candidates = picked
  ? [picked]
  : [
      ...household.keys.map((key) => defaultRef(key, size)),
      ...(input.visual ? [policy.vision] : []),
      policy[size],
      ...server.keys.map((key) => defaultRef(key, size)),
    ]
```

Update the file's opening comment to say photos and PDFs can have a model of their own.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm --filter @merran/shared test`
Expected: all pass. (`pnpm typecheck` fails in the server until Task 2, since its schemas don't have `vision` yet.)

- [ ] **Step 5: Commit**

`git add packages/shared/src/ai`. Message: "Let a household and the server pick a model for photos and PDFs", a body saying what changed and why, and both trailers.

---

### Task 2: Saving and showing it

**Files:**
- Modify: `apps/server/src/modules/ai/settings.ts` (`aiPolicySchema`)
- Modify: `apps/server/src/http/schemas/ai.ts` (`AiPolicySchema` description, `HouseholdAiSettingsSchema`, `HouseholdAiSchema` status, examples)
- Modify: `apps/server/src/services/ai/status.ts` (`resolveTask`, `householdAiStatus`)
- Test: `apps/server/src/http/routes/households/current/ai/ai.test.ts`, `apps/server/src/http/routes/settings/server/ai/ai.test.ts`
- Regenerate: `apps/server/src/http/openapi/openapi.json`, `apps/web/src/lib/api/schema.d.ts`, `apps/extension/src/lib/schema.d.ts`

**Interfaces:**
- Consumes: Task 1's fields and `ResolveInput.visual`.
- Produces:
  - `resolveTask(deps, em, householdId, task, estimate = 0, visual = false): Promise<Resolution>`.
  - `householdAiStatus(...)` returns `vision`, shaped like a task's status (`{ ok: true, ref, source }` or `{ ok: false, why }`), for the Import task with `visual: true`.
  - API: `HouseholdAiSettings.vision` and `AiPolicy.vision`: a model ref, nullable, defaulting to null when the body leaves it out. `HouseholdAi.status.vision` uses the same `taskStatus` schema.

- [ ] **Step 1: Write the failing tests**

In `households/current/ai/ai.test.ts`:

- Update `"goes by the models it picks, for each size and task"`:
  - The PUT body adds `vision: "openai:gpt-6-luna"`.
  - `picked` gains `vision: "openai:gpt-6-luna"`.
  - Expect `status.vision` toMatchObject `{ ref: "openai:gpt-6-luna" }`.
- Add `"keeps no Photos and PDFs model when a body leaves it out"`:
  - PUT `{ large: null, small: null, tasks: {}, monthlyLimit: null }` as Jamie.
  - Expect 200 and `settings.vision` toBe `null`.
  - Expect `status.vision` to equal `status.tasks.import`.
- Add `"reads settings saved before there was one as having none"`:
  - Through `database.em` (with the household filter off, as `householdAi` does), set Kyle's household's `settings.ai` to `{ large: null, small: null, tasks: {}, monthlyLimit: null, autoTidy: false }`, with no `vision`, and flush.
  - GET as Kyle: `settings.vision` is `null`, and `status.vision` equals `status.tasks.import`.
- Add `"says why a Photos and PDFs model with no key can't run"`:
  - PUT with `vision: "google:gemini-3.8-flash"`, a household with no Google key and a server without one.
  - Expect `status.vision` toEqual `{ ok: false, why: "noKey" }`.
  - Expect `status.tasks.import.ok` toBe `true`.
  - Put the settings back afterwards.

In `settings/server/ai/ai.test.ts`, extend `"saves the policy, dropping households that are gone"`:
- PUT with `vision: "anthropic:claude-haiku-5-5"` gives `policy.vision` of `"anthropic:claude-haiku-5-5"`.
- `put({ vision: "nobody:model" })` is 400.
- A body built from `DEFAULT_AI_POLICY` with `vision` deleted saves `policy.vision === null`.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @merran/server test -- households/current/ai settings/server/ai`
Expected: fail on `vision` missing from the responses, or 400 from the strict schemas.

- [ ] **Step 3: Implement**

- `aiPolicySchema` gains `vision: modelRefSchema.nullable().default(null)`.
- `HouseholdAiSettingsSchema` gains `vision: ModelRefSchema.nullable().default(null)`. Its description: "The model for every photo and PDF: imports, receipts, and assistant chats with one in them. It's used ahead of a task's own model; null to go by each task's."
- `AiPolicySchema`'s description adds: "`vision` is the model for photos and PDFs in households that haven't picked any."
- The examples gain `vision: null`.
- `HouseholdAiSchema.status` gains `vision: taskStatus`, described "The model and whose key for a photo or PDF, or why none."
- `resolveTask` passes `visual` to `resolveAi`.
- `householdAiStatus` computes `vision` with the same inputs as its tasks, for `task: "import", visual: true`. Pull the shared `resolveAi` input into a small named helper rather than repeating it.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm --filter @merran/server test -- households/current/ai settings/server/ai`
Expected: pass.

- [ ] **Step 5: Regenerate the API and typecheck**

Run: `pnpm --filter @merran/server openapi`, then in PowerShell from each of `apps/web` and `apps/extension`, `pnpm run api` with the cache variable above.
Expected:
- `git diff --stat` shows `openapi.json` and both `schema.d.ts` changed.
- `diff apps/web/src/lib/api/schema.d.ts apps/extension/src/lib/schema.d.ts` prints nothing.
- `pnpm typecheck` passes. If the web cards fail on the new field, leave them to Task 4 and say so in the commit's body.

- [ ] **Step 6: Commit**

`git add` the server files and the three generated files. Message: "Save and show a household's model for photos and PDFs", with both trailers.

---

### Task 3: Photo and PDF calls use it

**Files:**
- Modify: `apps/server/src/services/ai/run.ts` (`useAi`, `prepareAi`)
- Test: `apps/server/src/http/routes/households/current/ai/ai.test.ts` (the "AI calls" describe)
- Test: `apps/server/src/http/routes/recipes/import/ai-import.test.ts`
- Test: `apps/server/src/http/routes/recipes/import/video-import.test.ts`
- Test: `apps/server/src/http/routes/pantry/receipts/receipts.test.ts`
- Test: `apps/server/src/http/routes/assistant/assistant.test.ts`

**Interfaces:**
- Consumes: Task 2's `resolveTask(..., estimate, visual)`.
- Produces: a module-level helper in `run.ts`, `isVisual(needs?: readonly ModelAbility[]): boolean`: true when `needs` includes `"images"` or `"pdfs"`.

In the four feature test files, record where calls go: pass a `targets: AiTarget[]` array as `mockAiModels`'s second argument where it's `[]` today. Set the household's pick with `kyle.put("/api/households/current/ai", { large: null, small: null, tasks: {}, monthlyLimit: null, vision: <ref> })`, and put it back to `vision: null` in an `afterAll` or at the end of the test. Every file's server key is Anthropic's, so the refs are Claude models and `targets.at(-1)!.model` shows which one ran.

- [ ] **Step 1: Write the failing tests**

- `households/current/ai/ai.test.ts`, under "AI calls", add `"with a photo or PDF, go to the Photos and PDFs model and count under the task"`:
  - Set the household's `vision` to Haiku.
  - Call `useAi` with `needs: ["structured", "images"]`. Expect `targets.at(-1)` toMatchObject `{ model: "claude-haiku-5-5" }`.
  - Call it again with no `needs`. Expect `model: "claude-sonnet-5-5"`.
  - Expect `householdAi(kyle)`'s `usage.tasks` to have only `task: "import"`.
  - Expect the server's `usage.models` to contain both models.
  - Place it after the limit tests, clearing their limits first with `await setPolicy({})`.
- `ai-import.test.ts`, a new `describe("with a model for photos and PDFs", ...)` after "with AI", with the household's `vision` set to Haiku in its `beforeAll`:
  - `"reads photos with it"`: `importPhotos(jpeg)` is 201, and the last target's model is `"claude-haiku-5-5"`.
  - `"reads a PDF with it"`: the same with a `%PDF-1.7` buffer.
  - `"reads text and pages with the import model"`: `importText(...)` and the blog link import each leave the last target's model as `"claude-sonnet-5-5"`.
- `video-import.test.ts`: `"reads a video's frames with the model for photos and PDFs"`. Set `vision` to Haiku, import the same video as `"is read from its caption, captions and frames, with its thumbnail"`, and expect the last target's model to be `"claude-haiku-5-5"`.
- `receipts.test.ts`: `"reads a photo with the model for photos and PDFs, and text with the receipts model"`. Set `vision` to Opus. `scanned()` leaves `"claude-opus-5-5"`. A text-only scan (`["text", "Whole milk $3.48"]`) leaves `"claude-haiku-5-5"`. Delete both receipts.
- `assistant.test.ts`: `"talks about a photo with the model for photos and PDFs, for the rest of that chat"`. Set `vision` to Haiku, then:
  - Send a photo, as the existing photo test does (`uploadFile` then post `files`). The last target is Haiku.
  - `send(chatId, "And now?")` in the same chat leaves Haiku.
  - `send(await startChat(), "Hello")` leaves `"claude-sonnet-5-5"`.

  Delete the chats.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @merran/server test -- households/current/ai recipes/import pantry/receipts assistant`
Expected: the new tests fail with Sonnet (or Haiku for receipts) where the Photos and PDFs model is wanted. Every existing test passes.

- [ ] **Step 3: Implement**

- In `run.ts`, add `isVisual`. `useAi` passes `isVisual(options.needs)` to `resolveTask` as its sixth argument, after `options.estimate`. `prepareAi` passes it with `estimate` 0.
- Extend the file's opening comment: calls with photos or PDFs go to the household's model for them, when it has one.

- [ ] **Step 4: Run the tests and watch them pass**

Run: the same command.
Expected: all pass.

- [ ] **Step 5: Run the whole server suite**

Run: `pnpm --filter @merran/server test`
Expected: every file passes, with about 1,900 tests. Name any failure in the report, yours or not.

- [ ] **Step 6: Commit**

Message: "Read photos and PDFs with the household's model for them", with both trailers.

---

### Task 4: The pickers in Settings

**Files:**
- Modify: `apps/web/src/features/ai/household-ai-card.tsx`
- Modify: `apps/web/src/features/ai/server-ai-cards.tsx`
- Modify: `apps/web/src/locales/en.json` (`ai.models`, `ai.status`)

**Interfaces:**
- Consumes: Task 2's API fields (`settings.vision`, `policy.vision`, `status.vision`).

Exact words, under `ai.models`:
- `vision`: "Model for photos and PDFs"
- `visionDefault`: "As for each task"
- `visionHint`: "Used for every photo and PDF: imports, receipts, and assistant chats with one in them."

Under `ai.status`:
- `uses.vision`: "Photos and PDFs use {{model}}, on {{whose}}."
- `none.vision`: "Photos and PDFs can't run: {{why}}"

- [ ] **Step 1: Household card**

- A third `Field` after the small model's, with a `ModelSelect`: `value={picked.vision}`, `task="import"`, `noneLabel={t("ai.models.visionDefault")}`, `showSource`. Its `FieldDescription` is `visionHint`.
- Move `sizesHint` so it stays under the small picker.
- **Use the suggested models** shows when `picked.vision` is set, and clears it with `large`, `small` and `tasks`.
- `StatusLine` adds a third `li` with the `vision` status when that status's `ref` differs from the Import task's, or when it can't run but the Import task can. Add `"vision"` as a third key to the existing `line(task, size)` helper rather than writing a second one.

- [ ] **Step 2: Server card**

The same picker after the server's small default: `value={policy.vision}`, `task="import"`, `noneLabel={t("ai.models.visionDefault")}`, `onChange={(vision) => change({ vision })}`, with `visionHint` below it.

- [ ] **Step 3: Check**

Run: `pnpm typecheck`, then `pnpm format`, then `pnpm format:check`.
Expected: both pass.

- [ ] **Step 4: Look at it in a browser**

The user's API on :3000 runs main, without `vision`, so use a throwaway pair:
- Add temporary entries to the main checkout's `.claude/launch.json`, with absolute paths. One Node launcher starts this worktree's `apps/server/src/index.ts` with `PORT=3001` and `MERRAN_DATA_DIR` in the scratchpad. The other runs Vite from this worktree's `apps/web` on 5174, proxying to 3001. Launchers go in the worktree's git-ignored `apps/web/.local/`.
- Start both with `preview_start`, then remove the entries.
- Set up with the code from the API's log. The pickers only show once there are models, and a real key is never entered, so give the server an address with models:
  - Run a small Node `http` server, also in `apps/web/.local/`, on port 11435. It answers `GET /v1/models` with `{ "data": [{ "id": "llama3.1" }, { "id": "llava" }] }`.
  - Add it in **Settings → This server → AI** as a shared address, at `http://127.0.0.1:11435/v1`, or the machine's LAN address if loopback is refused.
  - The server's keys cover the admin's own household by default, so its pickers fill in.

Check on desktop and at phone width:
- The household card shows the three pickers with the hint.
- Picking only a Photos and PDFs model shows **Use the suggested models**, which clears it.
- Save keeps it, and a reload shows it.
- The status line adds the Photos and PDFs line only when the model differs.
- The server card saves its default.

Stop the three servers afterwards.

- [ ] **Step 5: Commit**

Message: "Add the model for photos and PDFs to Settings", with both trailers.

---

### Task 5: Docs, checks and the pull request

**Files:**
- Modify: `docs/platform.md`
- Modify: `docs/features.md`
- Modify: `apps/docs/src/content/docs/docs/run/ai-setup.md`

- [ ] **Step 1: Platform doc**

- Under "AI tasks", add a row after Prep reminders:

  | Task | Default size | Notes |
  |---|---|---|
  | Photos and PDFs | As for each task | A model for every call with a photo or PDF in it: imports, video frames, receipts, the assistant |

- Under "Whose key pays", add a paragraph headed with the decision date, November 9, 2026: the order from the spec's "Which model reads a photo or PDF", that spend counts under the task, and that nothing is retried with another model.

- [ ] **Step 2: Feature list**

- After "A suggested model for each task", add: `| A model for photos and PDFs | Detail | Built | Household and server default; used for every photo and PDF call, ahead of a task's own model |`.
- The notes on the photo import row, "Show the assistant a photo" and "Send the assistant a recipe as a PDF or photo" add: "or the household's model for photos and PDFs".

- [ ] **Step 3: Guide**

In `ai-setup.md` under "Choose models":
- Add a step after step 2: choose **Model for photos and PDFs** to send every photo and PDF to one model, over any task's own; **As for each task** leaves them with each task's model.
- Add a table row: `| Photos and PDFs | Photo and PDF imports, video frames, receipts, and assistant chats with a photo or PDF in them |`.
- Add one sentence for server admins: the same picker in **Settings → This server → AI** is for households that haven't picked models of their own.

Quote labels exactly as `en.json` has them.

- [ ] **Step 4: Run every check the change touches**

Run each and expect it to pass:
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm --filter @merran/shared test`
- `pnpm --filter @merran/server test`
- `pnpm --filter @merran/extension build`
- `pnpm docs:build`

Postgres: try `pnpm --filter @merran/server db:test-postgres` then `test:all`. If Docker won't start, say so in the pull request: CI runs it.

- [ ] **Step 5: Commit, push, open the pull request**

- Commit the docs: "Describe the model for photos and PDFs", with both trailers.
- `git push -u origin feat/photos-pdfs-model`.
- `gh pr create` titled `feat: pick a model for photos and PDFs`.
- The body says:
  - what it does and why, crediting bula87's fork commits 8e17e90 and 3b81157
  - how a model is chosen
  - what was checked, and what wasn't
  - and it ends with "🤖 Generated with [Claude Code](https://claude.com/claude-code)".
- Then bind the pull request with the ccd_pr tools.
