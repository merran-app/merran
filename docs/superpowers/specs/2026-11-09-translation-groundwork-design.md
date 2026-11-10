# Translation groundwork

Brief from Kyle, November 9, 2026, kept as written below: it's the spec. The findings after it are what reading the code turned up, and how they settle the points the brief left to the code. The plan is [2026-11-09-translation-groundwork.md](../plans/2026-11-09-translation-groundwork.md).

## The brief

Task: let people contribute a translation with one pull request
Goal: after this work, adding a language means adding one JSON file plus one line in a shared list, and CI says how complete it is. Ship English only. Don't add any translations in this PR.
Read first: `AGENTS.md`, `docs/stack.md` ("Translations from the start"), `docs/platform.md` ("Languages, units and regions"), `docs/open-source.md` (the translation check, and Weblate at 1.0), `docs/scope.md` (translations are in 0.1; "Imports in your language" is a separate feature and out of scope here).
1. One list of supported languages

* Add `packages/shared/src/i18n/locales.ts` and export it from `packages/shared/src/index.ts`.
* Export `LOCALES`: one entry per language, with its code (BCP 47, such as `en` or `pt-BR`), the language's name in that language (`English`, `Polski`), and its text direction (`ltr` or `rtl`).
* Also export a `Locale` type, an `isLocale()` check, and `DEFAULT_LOCALE = "en"`.
* Add a function that matches a browser language list (`navigator.languages`) to a supported locale: an exact match first, then the base language (`pt-BR` → `pt`), then English.
* Add tests in `packages/shared` for the matching.

2. Web app loads any language

* `apps/web/src/i18n.ts` currently loads only `en.json` and fixes `lng: "en"`. Change it to:
   * Keep `en.json` bundled as the base and fallback, and keep the type declaration (`CustomTypeOptions` stays typed from `en.json`).
   * Load other languages on demand, with `import.meta.glob("./locales/*.json")`, so no other file has to be edited to add a language.
   * Choose the language in this order: the person's saved preference, then the browser's language through the matching function, then English.
   * Set `<html lang>` and `dir` whenever the language changes.
* Dates and numbers: check that the app's date and number formatting follows the current i18next language rather than a hard-coded `"en-US"`. Grep for `toLocale`, `Intl.` and `"en-US"`. Fix those, or list the ones you leave.

3. A Language setting

* Server: save the choice in the existing `UserPreferences.language`, through whatever route already saves preferences (find how `appearance-card.tsx` saves appearance and do the same). Accept only codes from `LOCALES`, or null for "Match my browser". Don't add a migration.
* If the API changes: run `pnpm --filter @merran/server openapi`, then `pnpm --filter @merran/web api` and `pnpm --filter @merran/extension api` (on this machine, run the `api` scripts as described in `docs/` or memory: through PowerShell with the pnpm cache inside `.local/`).
* Web: add a `language-card.tsx` in `apps/web/src/features/account/` and put it on Settings → You (`apps/web/src/routes/_app/settings/you.tsx`).
   * The options are "Match my browser" plus each entry in `LOCALES`, each shown by its own name.
   * Use the app's shared select styling. On mobile it follows the drawer rule in `AGENTS.md`.
   * Changing it switches the language at once, without a reload.
* Hide the card while English is the only language, or show it disabled with a line saying more languages are coming. Pick whichever matches how the app treats similar settings.
* Put all the card's words in `en.json`.

4. A completeness check in CI

* Add `apps/web/scripts/check-locales.mjs` and a `check:locales` script in `apps/web/package.json`. For each `locales/*.json` other than English, it reports:
   * Missing keys. This is a warning: i18next falls back to English for them.
   * Extra keys that aren't in English. This is an error, since they're stale or misspelled.
   * `{{placeholders}}` that differ from English. This is an error, because it breaks the text at runtime.
   * Invalid JSON. This is an error.
   * Plurals: treat `key_one`, `key_few`, `key_many`, `key_other` and so on as one key, and don't require the same plural forms as English. Use `Intl.PluralRules` for the language to know which forms it needs.
   * Print a percentage done for each language.
* Run it in `.github/workflows/check.yml`. Make sure `.github/scripts/changes.mjs` runs it whenever a `locales/*.json` file changes (it already reacts to `en.json`), and update `.github/scripts/ci.test.mjs` to match.
* A locale must be in both `LOCALES` and `locales/` or neither. The check fails if one has it and the other doesn't.

5. Guidance for contributors

* Add an "Adding a language" section to the site's `apps/docs/src/content/docs/docs/project/contribute.md`. It should cover:
   * Copy `en.json` to `locales/<code>.json`, add the entry to `LOCALES`, run `pnpm --filter @merran/web check:locales`, and open a PR with a `feat:` title.
   * Partial translations are welcome, since English fills the gaps.
   * Keep `{{placeholders}}` and the HTML tags `<0>` and so on.
   * What i18next's plural keys are.
   * Reviewers check the structure. Wording is trusted to people who speak the language.
   * Weblate takes over at 1.0, so files will move under its control then.
* Add one line to `AGENTS.md` under "Keeping everything current": a new language means a locale file plus an entry in `LOCALES`, and `check:locales` must pass. Also note that changing an English string's meaning should change its key, so stale translations show up as missing rather than wrong.
* Add a guide in `use/` (or the existing settings guide) for the Language setting, quoting the labels exactly.

6. Docs and feature list

* `docs/features.md`: add or update a row for "Choose your language" with its importance and status. Leave "Translations, with units…" Planned, but note that the groundwork is built.
* `docs/platform.md`: describe how the language is chosen and the check, with today's date as the date of the decision.
* `docs/site-roadmap-audit.md`: update the Translations row.

Out of scope (list these as follow-ups in the PR)

* The extension's text, which doesn't use i18n yet.
* The server's error messages and emails.
* AI prompts and the language imports are translated into.
* The ingredient parser's food names.
* Setting up Weblate.

Done when

* `pnpm typecheck`, `pnpm format:check`, the shared and server tests, `check:locales` and `pnpm docs:build` all pass.
* In the dev app, a throwaway test locale (removed before committing) switches the whole interface at once, sets `<html lang>`, and survives a reload.

Credit: bula87's fork has a version of steps 1 and 3 (commit `4ba5114`: `packages/shared/src/i18n/locales.ts` and `apps/web/src/features/account/language-card.tsx`) that's worth looking at. If any of it is reused, credit them with a Co-authored-by line.

## Findings, November 9, 2026

### Where the choice is saved

- `appearance-card.tsx` doesn't save anything to the server: appearance is kept on the device. The only route that writes `UserPreferences` is `PATCH /api/auth/me/onboarding`, and it's for tours.
- So the language gets a route of its own beside it, `PATCH /api/auth/me/language`, as bula87's fork did ([4ba5114](https://github.com/bula87/merran/commit/4ba5114)). Its body is `{ language: <a code from LOCALES> | null }`.
- It answers with the person, as `GET /api/auth/me` does.
- `Me` gains `language`: the saved code, or null.
- `describeMe` reads it from the person's preferences, so the sign-in, join and setup responses carry it too.
- A saved code that isn't in `LOCALES` any more reads as null.
- No migration: `preferences` is JSON and already has `language`.

### Hidden or disabled

Hidden. Similar settings hide until they can be used:

- Household AI's model pickers show only once there are models.
- **Tidy up new recipes** shows only when AI is available.

So the Language card shows only when `LOCALES` has more than one language. With English alone, nothing changes on Settings → You.

### The drawer rule

- The shared `Select` (`components/ui/select.tsx`) has no phone version.
- On phones, choices open in a drawer, as the recipe filters' tag picker does: a drawer under `useIsMobile()`, a popover above it.
- So the card uses the shared `Select` on larger screens, and on phones a button with the current choice that opens a drawer listing the options.

### Applying the language

- **At start:** `main.tsx` renders once `startLanguage()` has chosen from the browser (the matching function, then English) and loaded that locale, so signed-out pages are in the browser's language from the first paint.
- **Signed in:** the app layout's `requireSignedIn` applies the person's saved language, after loading the signed-in person and before any page draws. Pages inside the app never show the wrong language first.
- **On change:** the card saves, applies the language and updates the cached person, with no reload.
- **Applying** loads the locale if it isn't loaded, switches i18next, and sets `<html lang>` and `dir`.
- **A failed load:** a locale that fails to load leaves the app in English.

### Dates and numbers

There's no `"en-US"` in the web app. These format with the browser's language rather than the app's, and are fixed to use i18next's:

| File | What |
|---|---|
| `features/account/connected-apps-card.tsx:70`, `:76` | `toLocaleDateString()`, `toLocaleString()` with no language |
| `features/pantry/receipts/receipt-page.tsx:28` | `Intl.DateTimeFormat(undefined, …)`, made once for the module |
| `features/pantry/receipts/receipt-page.tsx:40` | `toLocaleString(undefined, { style: "currency" })` |
| `features/assistant/proposal-card.tsx:50` | `Intl.DateTimeFormat(undefined, …)`, made once for the module |

Formatters made once for a module become per render, so they follow a language change.

Left as they are:

- `toLocaleLowerCase` in `features/stores/product-mappings-page.tsx`: case folding for search, not formatting.
- The server's `"en"` and `"en-US"`:
  - email templates and the assistant's prompt, which are out of scope
  - `services/plan/calendar/time.ts`, which reads time parts, not display
  - `http/schemas/households.ts`, which checks a time zone, not display

### The check in CI

- The web job already runs for any change under `apps/web/`, so a new `locales/*.json` runs it. `check:locales` goes in the web job.
- A change to `LOCALES` is in `packages/shared`, which runs everything.
- `.github/scripts/changes.mjs` needs no change. `.github/scripts/ci.test.mjs` gains a case pinning that a locale other than English runs `web` and `image`, but not `docs`. English does, because the site quotes its labels.
- The script imports `LOCALES` from `packages/shared/src/i18n/locales.ts` directly: Node 24 strips the types.
- Its comparing is a module of its own with `node:test` tests, run by the web `test` script.

The rules the brief leaves open:

- **A key** is its dot path in the JSON.
- **A plural group** is the keys that differ only by a final `_zero`, `_one`, `_two`, `_few`, `_many` or `_other`, and counts as one key.
- **A plural group's forms:** a language needs the forms `Intl.PluralRules` gives for it.
  - A form it doesn't need (`zero` is always allowed, as i18next reads it for 0) is an error.
  - A form it needs but doesn't have is a warning.
- **Placeholders:** a plain key's `{{placeholders}}` must be the same set as English's. A plural form's must be English's union for that group, except that `{{count}}` may be left out.
- **Percentage done:** English's keys, plural groups as one, that the language has with a non-empty value, over all of English's.
- **An empty value** counts as missing.
- **Exit:** 1 on any error. Warnings alone pass.

### Guide

There's no settings guide under `use/`. The Language setting gets `apps/docs/src/content/docs/docs/use/language.md`, listed in the site's sidebar (`apps/docs/astro.config.mjs` lists `use/` pages by hand).

### Credit

The route, `Me.language` and the card follow the fork's shape, so those commits carry `Co-authored-by: bula87 <bula87@gmail.com>`.
