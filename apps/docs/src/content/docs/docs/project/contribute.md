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

## Send a change

Keep changes focused, describe their behavior and validation, and update guides affected by the change. The project plan calls for DCO sign-off and disclosure of AI-written contributions; include those details in your contribution.

[Browse the source](https://github.com/merran-app/merran) or [report a bug](https://github.com/merran-app/merran/issues).
