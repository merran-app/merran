# Translation groundwork: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adding a language takes one JSON file plus one line in a shared list. The web app loads it on demand, a Language setting chooses it, and CI says how complete it is. English is still the only language.

**Architecture:** `packages/shared` holds `LOCALES` and the browser-language matching. The server saves the person's choice in `UserPreferences.language` through a new `PATCH /api/auth/me/language`, and returns it on `Me`. The web app bundles English, loads other locales through `import.meta.glob`, chooses saved → browser → English, and sets `<html lang>` and `dir`. A Node script compares each locale with English in CI.

**Tech Stack:** TypeScript, i18next with react-i18next, Vite, Hono with zod-openapi, MikroORM, Vitest, node:test, GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-11-09-translation-groundwork-design.md](../specs/2026-11-09-translation-groundwork-design.md): the brief as written, then the findings that settle its open points.

## Global constraints

- Work in `D:\Development\Mise\.claude\worktrees\translation-groundwork`, branch `feat/translation-groundwork`. Never touch the main checkout or the user's dev servers on ports 3000 and 5173.
- Ship English only. No translations are committed. The throwaway locale in Task 5 is removed before its commit.
- `CustomTypeOptions` stays typed from `en.json`.
- Every word the card shows goes in `apps/web/src/locales/en.json`, quoted exactly in the guide.
- Mobile uses drawers: the card's choices open in a drawer on phones.
- No migration.
- Routes mirror the API, and `index.ts` files only register.
- Run Prettier from the root (`pnpm format`), never on `docs/`. Run the `api` scripts in PowerShell with `$env:pnpm_config_cache_dir = "D:\Development\Mise\.local\pnpm-cache"`.
- Edit regular expressions with the editor, not shell heredocs (Git Bash mangles `\b`).
- Match the code around you: plain-English comments that say why, normal line breaks, named helpers.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The ones for the route, `Me.language` and the card (Tasks 2 and 5) also carry `Co-authored-by: bula87 <bula87@gmail.com>`.
- TDD: write each test, watch it fail for the right reason, then write the code.

## Review focus

1. **A saved language that's no longer in `LOCALES`, or junk in the JSON.** It reads as no choice: the browser's language, then English. `GET /api/auth/me` must not fail its own response schema. Pinned in Task 2.
2. **Browser language lists:** mixed case (`PT-br`), regions, scripts (`zh-Hant-TW`), `*`, and an empty list. They match exactly, then by base language, then English. Pinned in Task 1.
3. **A locale file that fails to load** (offline, a stale build). The app renders in English rather than blank or stuck. Pinned in Task 3.
4. **Formatters made once for a module** keep the old language after a switch. They become per render. Pinned in Task 3 by a grep, and seen in Task 5's browser check.
5. **A right-to-left language** sets `dir="rtl"`, and switching back sets `ltr` again. Seen in Task 5's browser check.

---

### Task 1: One list of languages

**Files:**
- Create: `packages/shared/src/i18n/locales.ts`
- Test: `packages/shared/src/i18n/locales.test.ts`
- Modify: `packages/shared/src/index.ts` (export it, in alphabetical order with the others)

**Interfaces:**
- Produces, from `@merran/shared`:
  - `type LocaleInfo = { code: string; name: string; dir: "ltr" | "rtl" }`
  - `LOCALES`: `[{ code: "en", name: "English", dir: "ltr" }] as const satisfies readonly LocaleInfo[]`
  - `type Locale = (typeof LOCALES)[number]["code"]`
  - `LOCALE_CODES: [Locale, ...Locale[]]`, the codes in order, for `z.enum`
  - `DEFAULT_LOCALE: Locale = "en"`
  - `isLocale(value: unknown): value is Locale`
  - `localeDirection(code: Locale): "ltr" | "rtl"`
  - `matchLanguage(languages: readonly string[], codes: readonly string[], fallback: string): string`: the pure rule, testable with any list
  - `matchLocale(languages: readonly string[]): Locale`, which is `matchLanguage(languages, LOCALE_CODES, DEFAULT_LOCALE)`

`matchLanguage` takes each browser language in order. For each one:
- An exact match, ignoring case, wins.
- Otherwise, an available code whose base language (its first subtag) is the same wins: the code that is only that base first, then the first code sharing it.

If no browser language matches, the fallback. Tags that aren't languages (`*`, `""`) match nothing.

- [ ] **Step 1: Write the failing tests**

`describe("matchLanguage")`, with `codes = ["en", "pt", "pt-BR", "pl", "zh-Hant"]` unless a test says otherwise:
- `"an exact match, whatever its case"`: `["PT-br"]` gives `"pt-BR"`.
- `"then the base language"`: `["pt-PT"]` gives `"pt"`.
- `"or a regional code for a base language"`: `["pt"]` with codes `["en", "pt-BR"]` gives `"pt-BR"`.
- `"the first preference that matches at all, not the first exact one"`: `["pt-PT", "pl"]` gives `"pt"`.
- `"a script subtag shares its base"`: `["zh-Hant-TW"]` gives `"zh-Hant"`.
- `"then the fallback"`: `["de-DE"]`, `[]`, `["*"]` and `[""]` each give `"en"`.

`describe("locales")`:
- `"English is the default, and every code is a locale"`: `isLocale("en")` is true, `isLocale("xx")`, `isLocale(null)` and `isLocale(3)` are false, `DEFAULT_LOCALE` is `"en"`, and `localeDirection("en")` is `"ltr"`.
- `"each locale names itself and says its direction"`: every `LOCALES` entry has a non-empty `name`, a `dir` of `ltr` or `rtl`, and a code that `Intl.getCanonicalLocales` accepts unchanged.
- `"a browser's languages match the list"`: `matchLocale(["pt-BR"])` is `"en"` today.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @merran/shared test`
Expected: fails on the missing module. With stubs (`matchLanguage` returning the fallback, `isLocale` returning false), the matching tests fail on their values.

- [ ] **Step 3: Implement, and export from the index.**

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm --filter @merran/shared test`, then `pnpm --filter @merran/shared typecheck`
Expected: both pass. The shared package is ES2024 with no DOM types; `Intl` is in ES2024.

- [ ] **Step 5: Commit**

Message: "Add the list of languages Merran speaks, and match a browser's to it", with a body saying why, and the Claude trailer.

---

### Task 2: Saving the person's language

**Files:**
- Modify: `apps/server/src/http/schemas/auth.ts`:
  - `MeSchema` gains `language: z.enum(LOCALE_CODES).nullable()`, described "The language the person chose; null to follow their browser."
  - `describeMe` reads it.
- Modify: `apps/server/src/http/schemas/examples.ts` (`ME` gains `language: null`)
- Create: `apps/server/src/http/routes/auth/me/language/{index,patch}.ts`, registered in `auth/me/index.ts`
- Test: `apps/server/src/http/routes/auth/me/language/language.test.ts`
- Regenerate: `openapi.json` and both `schema.d.ts` files

**Interfaces:**
- Consumes: Task 1's `LOCALE_CODES`, `isLocale`.
- Produces:
  - `describeMe(em, user, activeHouseholdId)`, unchanged in signature. It loads the person's `preferences` (`em.findOne(User, user.id, { fields: ["preferences"] })`) and sets `language` to the saved value when `isLocale`, else null.
  - `PATCH /api/auth/me/language`:
    - operationId `setLanguage`, tag `Sign-in`, `security: SESSION_SECURITY`, guarded by `signedIn(c)`
    - body `LanguageChoice`: `{ language: z.enum(LOCALE_CODES).nullable() }`, described "A code from Merran's languages, or null to follow the browser."
    - answers 200 with `Me` (`requiresTwoFactor: false`)
    - null removes `language` from the preferences, leaving every other preference as it was

- [ ] **Step 1: Write the failing tests**

In `language.test.ts`, set up with `createTestApp` and `setUpServer` (Kyle), with Sam joined to Kyle's household (`join`, `inviteToken`, `account`) and `database` from the test app:
- `"follows the browser until chosen"`: `GET /api/auth/me` has `language: null`.
- `"saves a language, and gives it back with the person"`: PATCH `{ language: "en" }` is 200 with `language: "en"`. `GET /api/auth/me` then has `language: "en"`. Sam's `GET /api/auth/me` still has null.
- `"null goes back to the browser, keeping other preferences"`:
  - Before: through `database.em`, set Kyle's `preferences` to `{ units: "metric", language: "en" }`.
  - PATCH `{ language: null }` gives `language: null`.
  - After: the stored preferences are `{ units: "metric" }`.
- `"takes only Merran's languages"`: `{ language: "xx" }`, `{ language: "" }` and `{}` are each 400.
- `"reads a language Merran no longer has as none"`: set Kyle's stored `preferences.language` to `"tlh"` through `database.em`. `GET /api/auth/me` is 200 with `language: null`.
- `"is the signed-in person's, not an API key's"`: an API key with any permission gets 403 (`api_key_not_allowed`), and no session gets 401.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @merran/server test -- auth/me/language`
Expected: `language` missing from `Me`, and 404 for the route.

- [ ] **Step 3: Implement**

Update the schema, `describeMe`, the example, the route and its registration. The route's description: "The language the person sees Merran in, on every device. Null follows their browser."

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm --filter @merran/server test -- auth/me/language`, then the whole suite, `pnpm --filter @merran/server test`.
Expected: all pass, apart from the stale `openapi.json`.

- [ ] **Step 5: Regenerate the API, typecheck, commit**

Run `pnpm --filter @merran/server openapi`, then `pnpm run api` in `apps/web` and `apps/extension` (PowerShell, with the cache variable).
Expected:
- the two `schema.d.ts` files are identical
- `pnpm typecheck` passes
- `pnpm --filter @merran/server test -- openapi` passes

Commit message: "Save the language each person chooses", with both trailers.

---

### Task 3: The web app loads any language

**Files:**
- Create: `apps/web/src/lib/locale-files.ts`, and `locale-files.test.ts` (added to the web `test` script)
- Modify: `apps/web/src/i18n.ts`
- Modify: `apps/web/src/main.tsx` (render once the language is chosen)
- Modify: `apps/web/src/features/auth/require-signed-in.ts` (apply the saved language)
- Modify:
  - `apps/web/src/features/account/connected-apps-card.tsx`
  - `apps/web/src/features/pantry/receipts/receipt-page.tsx`
  - `apps/web/src/features/assistant/proposal-card.tsx`

**Interfaces:**
- Consumes: Task 1's `matchLocale`, `localeDirection`, `DEFAULT_LOCALE`, `isLocale`, `Locale`. Task 2's `Me.language`.
- Produces:
  - In `locale-files.ts`:
    - `codeFromPath(path: string): string | null`: `"./locales/pt-BR.json"` gives `"pt-BR"`, and anything not ending `.json` gives null
    - `loadLocale(code: string, loaders: Record<string, () => Promise<unknown>>): Promise<Record<string, unknown> | null>`: the loader whose path is that code's, giving its module's `default` (or the module) when it's an object. Null when there's no such loader, it throws, or it gives something that isn't an object.
  - In `i18n.ts`:
    - `applyLanguage(preference: Locale | null): Promise<void>`: the preference, or `matchLocale(navigator.languages ?? [navigator.language])`. Loads that locale if needed and switches i18next. A locale that won't load leaves English. Sets `document.documentElement.lang` and `.dir`.
    - `startLanguage(): Promise<void>`, which is `applyLanguage(null)`

`i18n.ts` keeps `en.json` imported and bundled, `fallbackLng: "en"`, `lng: "en"` at init, and the `CustomTypeOptions` block. Other locales come from `import.meta.glob(["./locales/*.json", "!./locales/en.json"])`, so adding a file needs nothing else. A locale already loaded isn't loaded again (`i18n.hasResourceBundle`).

- [ ] **Step 1: Write the failing tests**

`locale-files.test.ts`, with `node:test` like `features/pantry/on-list.test.ts`:
- `"a locale file's code is its name"`: `./locales/pt-BR.json` gives `pt-BR`, `./locales/en.json` gives `en`, and `./locales/readme.md` gives null.
- `"loads the file for a code"`: loaders `{ "./locales/pl.json": async () => ({ default: { hello: "Cześć" } }) }` give `{ hello: "Cześć" }` for `pl`.
- `"none for a code without a file"` gives null.
- `"none, not a crash, when the file won't load"`: a loader that rejects gives null, and so does one giving `{ default: "oops" }`.

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test src/lib/locale-files.test.ts`, from `apps/web`.
Expected: fails on the missing module, then, with stubs giving null, on the first two tests.

- [ ] **Step 3: Implement**

- `locale-files.ts`, then `i18n.ts`'s two functions.
- `main.tsx` renders inside `startLanguage().finally(…)`, so a failed load still renders.
- `requireSignedIn` awaits `applyLanguage(me.language)` once it has `me` and before returning, after the two-factor redirect.
- Fix the five formatting spots in the spec's table:
  - Pass `i18n.language` (from `useTranslation()`) where the language is `undefined` or missing.
  - Move the two module-level `Intl.DateTimeFormat`s into their components, built with `i18n.language`.

- [ ] **Step 4: Check**

Run, from the root:
- `pnpm --filter @merran/web test`: all pass.
- `pnpm typecheck`: passes.
- `grep -rn "Intl.DateTimeFormat(undefined\|toLocaleString(undefined\|toLocaleDateString()\|toLocaleString()" apps/web/src`: prints nothing.
- `pnpm format` then `pnpm format:check`: passes.

- [ ] **Step 5: Commit**

Message: "Load the app in the person's language, or their browser's", with the Claude trailer.

---

### Task 4: The completeness check

**Files:**
- Create: `apps/web/scripts/check-locales.mjs` (the command)
- Create: `apps/web/scripts/locales/compare.mjs`, and `compare.test.mjs` (added to the web `test` script)
- Modify: `apps/web/package.json` (`"check:locales": "node scripts/check-locales.mjs"`)
- Modify: `.github/workflows/check.yml` (the web job runs `pnpm --filter @merran/web check:locales` after `check:contrast`)
- Modify: `.github/scripts/ci.test.mjs` (a case: `[["apps/web/src/locales/pl.json"], ["web", "image"]]`)

**Interfaces:**
- Produces, from `compare.mjs`, plain JavaScript with JSDoc types:
  - `parseLocale(text: string): { ok: true, data: object } | { ok: false, error: string }`
  - `compareLocale({ english, translation, language }): { percent: number, missing: string[], extra: string[], placeholders: string[], missingForms: string[], extraForms: string[] }`. Keys are dot paths, and a plural group is reported by its base (`recipes.count`).
  - `localeSetErrors(fileCodes: string[], localeCodes: string[]): string[]`: one message for each code other than `en` that's in one list and not the other

The rules are the spec's "The check in CI". `missing` and `missingForms` are warnings. `extra`, `placeholders` and `extraForms` are errors.

`check-locales.mjs`:
- Reads `src/locales/*.json`, parses each with `parseLocale` (invalid JSON is an error), and imports `LOCALES` from `../../../packages/shared/src/i18n/locales.ts`.
- Runs `localeSetErrors`, then `compareLocale` for each locale other than English.
- Prints a line per language, like `pl  87% done  12 missing  0 errors`, then each error and warning with its key.
- With only English, it prints `Only English so far.`
- Exits 1 on any error.

- [ ] **Step 1: Write the failing tests**

In `compare.test.mjs`, with `node:test`:
- `parseLocale`: valid JSON gives `ok: true`, and `{ "a": }` gives `ok: false` with a message.
- `"a plural group is one key, whatever forms English has"`: English `{ recipes: { count_one: "{{count}} recipe", count_other: "{{count}} recipes" } }` and Polish with `count_one`, `count_few`, `count_many` and `count_other` (`language: "pl"`) give `percent: 100` and no errors or warnings.
- `"a missing key is a warning, and lowers the percentage"`: English `{ a: "A", b: "B" }` and `{ a: "Á" }` give `missing: ["b"]` and `percent: 50`.
- `"an empty value counts as missing"`: `{ a: "Á", b: "" }` gives `missing: ["b"]`.
- `"a key English doesn't have is an error"`: `{ a: "Á", b: "B", c: "C" }` gives `extra: ["c"]`.
- `"placeholders must match English's"`: English `{ hi: "Hi {{name}}" }` and `{ hi: "Salut {{nom}}" }` give `placeholders: ["hi"]`.
- `"a plural form may leave out {{count}}"`: French `count_one: "Une recette"` against English `"{{count}} recipe"` gives no `placeholders`.
- `"forms the language doesn't use are errors, and ones it needs are warnings"`:
  - Japanese (`ja`, which only has `other`) with `count_one` gives `extraForms: ["recipes.count_one"]`.
  - Polish with only `count_one` and `count_other` gives `missingForms` naming `recipes.count_few` and `recipes.count_many`.
  - `count_zero` is never an extra form.
- `localeSetErrors(["en", "pl"], ["en", "de"])` gives two messages, one naming `pl` and one naming `de`. `(["en"], ["en"])` gives none.

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test scripts/locales/compare.test.mjs`, from `apps/web`.
Expected: fails on the missing module, then, with stubs, on each assertion.

- [ ] **Step 3: Implement `compare.mjs` and `check-locales.mjs`, and add the scripts, the workflow step and the CI test case.**

- [ ] **Step 4: Check**

Run:
- `pnpm --filter @merran/web test`: all pass.
- `pnpm --filter @merran/web check:locales`: prints `Only English so far.` and exits 0.
- `node --test .github/scripts/ci.test.mjs`: passes.
- `pnpm format:check`: passes.

- [ ] **Step 5: Commit**

Message: "Say how complete each translation is, in CI", with the Claude trailer.

---

### Task 5: The Language setting

**Files:**
- Create: `apps/web/src/features/account/language-card.tsx`
- Modify: `apps/web/src/routes/_app/settings/you.tsx` (`<LanguageCard />` after `<AppearanceCard />` in "your-profile")
- Modify: `apps/web/src/locales/en.json`

**Interfaces:**
- Consumes:
  - Task 1's `LOCALES`
  - Task 2's `PATCH /api/auth/me/language` and `Me.language`
  - Task 3's `applyLanguage`
  - `meQuery` and `useMe`, the shared `Select` parts, `Drawer`, and `useIsMobile` (`@/hooks/use-mobile`)
- Produces: `LanguageCard()`, which renders nothing while `LOCALES.length < 2`.

Exact words, under `settings.you.language`:
- `title`: "Language"
- `description`: "The language Merran shows you, on every device you sign in on."
- `browser`: "Match my browser"

Each language is shown by its own `name` from `LOCALES`, not translated.

- [ ] **Step 1: Write the card**

- **Options:** "Match my browser" (value `"browser"`, meaning null) plus each `LOCALES` entry.
- **On a change:** PATCH, then `queryClient.setQueryData(meQuery.queryKey, me)` with the answer, then `applyLanguage(me.language)`. An `ApiError` shows as a toast. Nothing reloads.
- **Larger screens:** the shared `Select` (as `features/ai/model-select.tsx` uses it).
- **Phones (`useIsMobile()`):** an outline button showing the current choice, which opens a `Drawer` titled "Language" listing the options as full-width buttons, the current one marked. Choosing one saves and closes it. This follows `TagPicker` in `features/recipes/recipe-filters.tsx`.
- **When it shows:** it returns null while `LOCALES.length < 2`, with a comment saying why: settings that can't be used yet are hidden, as Household AI's pickers are.

- [ ] **Step 2: Check**

Run: `pnpm typecheck`, `pnpm format`, then `pnpm format:check`.
Expected: both pass.

- [ ] **Step 3: Try it with a throwaway language**

Add a temporary right-to-left test locale. **It must not be committed.**
- `{ code: "ar-XB", name: "Test (rtl)", dir: "rtl" }` added to `LOCALES`.
- `apps/web/src/locales/ar-XB.json`, made from `en.json` by a Node one-off that wraps every string in `‹…›`, keeping `{{placeholders}}` and `<0>` tags.

Run `pnpm --filter @merran/web check:locales`.
Expected: `ar-XB  100% done  0 missing  0 errors`.

Then run a throwaway pair:
- Node launchers in the worktree's git-ignored `apps/web/.local/`: the API on 3001 with `MERRAN_DATA_DIR` in the scratchpad; Vite on a free port proxying to it.
- Temporary entries in the main checkout's `.claude/launch.json`, removed once the servers are up.

Set up the server, then check on Settings → You:
- The Language card shows "Match my browser" and "Test (rtl)".
- Choosing "Test (rtl)" switches the whole interface at once: the sidebar, page and toasts are all in `‹…›`. `document.documentElement.lang` is `ar-XB` and `dir` is `rtl`.
- A reload keeps it.
- A formatted date follows the language: on Recipes → Recently deleted, after deleting a recipe, its date is no longer in its English form.
- "Match my browser" brings English back at once, with `lang="en"` and `dir="ltr"`.
- At 375 px, the choices open in a drawer.
- The console shows no errors.

Then:
- Remove the `ar-XB` entry and `ar-XB.json`. `git status` shows neither.
- `pnpm --filter @merran/web check:locales` prints `Only English so far.` again.
- Stop the servers and delete the scratch data.

- [ ] **Step 4: Commit**

Message: "Add a Language setting, shown once there's a language to choose", with both trailers.

---

### Task 6: Guidance, docs, checks and the pull request

**Files:**
- Modify: `apps/docs/src/content/docs/docs/project/contribute.md` ("Adding a language")
- Modify: `AGENTS.md` (a row under "Keeping everything current")
- Create: `apps/docs/src/content/docs/docs/use/language.md`
- Modify: `apps/docs/astro.config.mjs` (`{ label: "Language", slug: "docs/use/language" }` in the Use section, after "Sharing recipes")
- Modify: `docs/features.md`, `docs/platform.md`, `docs/site-roadmap-audit.md`

- [ ] **Step 1: Contributor guidance**

`contribute.md` gets "## Adding a language", before "## Send a change", covering each point in the brief's step 5:
- Copy `apps/web/src/locales/en.json` to `locales/<code>.json`.
- Add the language to `LOCALES` in `packages/shared/src/i18n/locales.ts`, with its own name and direction.
- Run `pnpm --filter @merran/web check:locales`.
- Open a pull request titled `feat: …`.
- Partial translations are welcome: English fills the gaps.
- Keep `{{placeholders}}` and tags like `<0>…</0>`.
- i18next's plural keys (`_one`, `_few`, `_many`, `_other`) come from `Intl.PluralRules`, and the check says which a language needs.
- Reviewers check structure; wording is trusted to people who speak the language.
- Weblate takes over at 1.0, and the files move under its control then.

`AGENTS.md`, a row in the table: `| A language: a new file in apps/web/src/locales | An entry in LOCALES (packages/shared/src/i18n/locales.ts); pnpm --filter @merran/web check:locales must pass. When an English string's meaning changes, give it a new key, so its translations show as missing rather than wrong |`. Backtick the paths as the table does.

- [ ] **Step 2: The guide**

`use/language.md`, titled "Language", with a one-line description. It says:
- Settings → You → **Language** chooses the language Merran shows you, on every device you sign in on.
- **Match my browser** follows the browser's language, and English when Merran doesn't have it.
- The setting appears once Merran has more than one language.
- Translations are welcome: a link to "Adding a language" in the contribute page.

Labels are quoted exactly as `en.json` has them.

- [ ] **Step 3: Docs**

- `docs/features.md`: add `| Choose your language | Key | Built | Settings → You → Language, saved per person; Match my browser by default. Shows once a second language exists |` near "Translations, with units…". That row stays Planned, its notes adding: "Groundwork built November 9, 2026: one list of languages, locales loaded on demand, the Language setting, and a completeness check in CI."
- `docs/platform.md`, under "Languages, units and regions", a paragraph dated November 9, 2026:
  - the language is chosen in this order: saved preference, the browser's languages (exact, then base language), then English
  - English is bundled and other locales load on demand
  - `<html lang>` and `dir` follow the language
  - `check:locales` reports missing keys as warnings, and extra keys, changed placeholders, invalid JSON and plural forms the language doesn't use as errors, with a percentage done
  - a locale must be in `LOCALES` and `locales/` both
- `docs/site-roadmap-audit.md`: the Translations row's evidence becomes the groundwork (the `LOCALES` list, on-demand loading, the Language setting, `check:locales`). Left: actual translations, Weblate, and translated imports.

- [ ] **Step 4: Run every check the change touches**

Each must pass:
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm --filter @merran/shared test`
- `pnpm --filter @merran/server test`
- `pnpm --filter @merran/web test`
- `pnpm --filter @merran/web check:locales`
- `pnpm --filter @merran/extension build`
- `pnpm docs:build`

Then Postgres: `pnpm exec vitest run --project postgres` from `apps/server`. A file that times out under load is run again on its own before it's called load.

- [ ] **Step 5: Commit, review, push, open the pull request**

- Commit the docs: "Describe adding a language and the Language setting", with the Claude trailer.
- After the whole-branch review and its fixes, `git push -u origin feat/translation-groundwork`.
- `gh pr create --repo merran-app/merran`, titled `feat: lay the groundwork for translations`. The body says:
  - what it does, and that it ships English only
  - how a language is chosen and checked
  - what was checked, including the throwaway right-to-left locale
  - follow-ups, as the brief lists them: the extension's text; the server's error messages and emails; AI prompts and the import language; the ingredient parser's food names; Weblate
  - credit to bula87's 4ba5114
  - and it ends with "🤖 Generated with [Claude Code](https://claude.com/claude-code)".
- Check it's bound with the ccd_pr tools.
