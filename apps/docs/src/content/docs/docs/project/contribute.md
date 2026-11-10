---
title: Contribute
description: Start a local Merran development environment and work on the documentation site.
---

Merran is a TypeScript monorepo. The server, web app, browser extension, shared code, and public site live together so a behavior change can include its documentation.

## Local development

Use Node 24 and the pnpm version declared in the root package.json:

```bash
corepack enable
pnpm install
pnpm dev
```

The web app runs on port 5173 and the API on port 3000. The server prints a setup code for a new local database.

The API does not automatically load `.env` during `pnpm dev`. Set process environment variables in the terminal that starts it; see [source development settings](../../run/configuration/#source-development-environment) for a PowerShell example. For email invitations, use the web app's reachable origin as `MERRAN_PUBLIC_URL`, configure **Settings → Server → Email**, then restart and reload after environment changes.

## Work on this site

From the repository root:

```bash
pnpm docs:dev
```

The terminal prints the local site address. Build and check it with:

```bash
pnpm --filter @merran/docs typecheck
pnpm docs:build
```

The site package is apps/docs. Guides live in src/content/docs; the homepage uses the supplied landing-page design with separate HTML sections, CSS, and browser interactions.

## Change the API documentation

Change the server's route schemas and examples, then regenerate its committed spec:

```bash
pnpm --filter @merran/server openapi
```

The public endpoint reference reads that file at build time. Avoid editing generated endpoint pages by hand.

## Change the settings reference

The [settings reference](../../run/settings-reference/) is generated from `BOOT_SETTINGS` and `MODULE_SETTINGS`. After changing a registered definition, run:

```bash
pnpm --filter @merran/docs settings:generate
pnpm --filter @merran/docs test
pnpm --filter @merran/docs typecheck
```

Commit the regenerated page with the definition change. Development startup and builds regenerate it; typecheck rejects a stale page. The generator reads TypeScript syntax without starting the server or loading deployment secrets. Internal settings are excluded. A small editorial description map in the generator qualifies provider costs and external data flow without changing generated keys, scopes, or defaults. Unsupported metadata expressions fail generation rather than silently omitting an entry.

## Adding a language

A language is one file and one line, in one pull request:

1. Copy `apps/web/src/locales/en.json` to `apps/web/src/locales/<code>.json`, where `<code>` is the language's BCP 47 code, such as `pl` or `pt-BR`, and translate its strings.
2. Add the language to `LOCALES` in `packages/shared/src/i18n/locales.ts`: its code, its name in itself (`Polski`, not `Polish`), and its direction, `ltr` or `rtl`.
3. Run `pnpm --filter @merran/web check:locales`. It says how much is translated, and fails on anything that would break.
4. Open a pull request with a `feat:` title, such as `feat: add Polish`.

Partial translations are welcome: any string not translated yet shows in English.

Keep the `{{placeholders}}` exactly as English has them, since Merran fills them in, and the tags around text, like `<0>` and `</0>`, which become links and bold. A plural form may leave out `{{count}}` when the words say the number, as French `count_one` "Une recette" does.

Strings that change with a number have a form for each plural category, such as `count_one` and `count_other` in English. Languages need different forms: Polish has `_one`, `_few`, `_many` and `_other`, and Japanese only `_other`. The check reads the forms each language needs from `Intl.PluralRules`, warns about any that are missing, and fails on forms the language doesn't use.

Reviewers check the structure: the check passes and nothing else changes. The wording is trusted to people who speak the language.

A right-to-left language, such as Arabic or Hebrew, gets a mirrored layout from its `rtl` direction: the sidebar moves to the right, and arrows point the other way.

When Merran reaches 1.0, translations move to Weblate, and these files are kept up to date from there.

## Send a change

Keep changes focused, describe their behavior and validation, and update guides affected by the change. The project plan calls for DCO sign-off and disclosure of AI-written contributions; include those details in your contribution.

[Browse the source](https://github.com/merran-app/merran) or [report a bug](https://github.com/merran-app/merran/issues).
