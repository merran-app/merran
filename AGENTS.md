# Working on Merran

How to work on Merran, for AI coding agents (Codex, Claude Code, Copilot and the rest) and for people. Merran is a self-hosted meal planner: [README.md](README.md) says what it does, and [docs/](docs/README.md) holds the plan and every decision behind it. Read the doc for the area you're changing before you change it.

## The repo

| Folder | What it is |
| --- | --- |
| `apps/server` | The API: Hono with OpenAPI, MikroORM on SQLite or Postgres, the jobs, and the optional modules |
| `apps/web` | The app: React, TanStack Router and Query, shadcn/ui on Base UI |
| `apps/extension` | The browser extension (WXT), for Chrome, Edge and Firefox |
| `apps/docs` | The public site and its documentation: Astro and Starlight |
| `apps/telemetry` | The project's telemetry receiver at `telemetry.merran.app`: a Cloudflare Worker with D1, deployed from main |
| `packages/shared` | What the server and the apps share: the ingredient parser, units, foods, planning, versions |
| `docs/` | Plans and decision records, for the people building Merran, not the public docs. `docs/features.md` is the feature list |

## Commands

Node 24 and pnpm, through corepack (`corepack enable`), from the repo's root:

- `pnpm install`, then `pnpm dev`: the web app on http://localhost:5173 and the API on :3000, on SQLite in `apps/server/data`. The setup code prints in the same terminal. If a dev server is running already, use it rather than starting another.
- `pnpm typecheck`, and `pnpm format:check` (`pnpm format` to fix). Prettier covers `apps` and `packages`: run it from the root or on named folders, never on `docs/`, which is written by hand.
- `pnpm --filter @merran/server test` runs the server's tests on SQLite, and `test:all` on SQLite and Postgres (`pnpm --filter @merran/server db:test-postgres` starts a throwaway Postgres in Docker). `pnpm --filter @merran/shared test` for the shared code, and `pnpm --filter @merran/telemetry test` for the telemetry receiver.
- `pnpm --filter @merran/web check:contrast` after changing colors.
- `pnpm --filter @merran/extension build`, and `build:firefox`.
- `pnpm docs:dev` and `pnpm docs:build` for the public site. The build checks every link.

CI runs all of these (`.github/workflows/check.yml`, and `docs.yml` for the site). Run the ones your change touches before calling it done.

## How the code is laid out

- **Routes mirror the API.** Each part of a path is a folder, a `{param}` is `[param]`, and each method is a file named after it: `PATCH /api/households/current/members/{memberId}` is `apps/server/src/http/routes/households/current/members/[memberId]/patch.ts`. A folder's `index.ts` only registers its routes and subfolders. A test checks all of this.
- **Settings exist only through modules.** A module's settings go in its `settings.ts` and in `apps/server/src/modules/settings.ts`; settings Merran needs to start go in `apps/server/src/core/config.ts`. Each has a `MERRAN_` environment variable.
- **Words people read** in the web app are in `apps/web/src/locales/en.json`.
- **Mobile uses drawers, never modal dialogs.** Forms, confirmations and other content that opens in a dialog on larger screens must open in a drawer on mobile. Follow this rule for new UI and when changing existing dialogs, reusing the app's existing drawer patterns.
- **Files go in folders.** Keep the root and each folder short: put related files in a folder of their own rather than side by side.
- **Match the code around you:** its naming, its idioms, and its comments, which are plain English and say why.
- **Package versions:** pnpm won't install a version newer than its minimum release age. Pick an older version rather than adding an exemption.

## Keeping everything current

A change isn't done until everything that describes it says the same, in the same pull request:

| When you change... | Also update |
| --- | --- |
| A feature: building it, changing it, or its plan | `docs/features.md` (its importance and status), and the plan in `docs/` it belongs to |
| How something is used: a screen, a label in `en.json`, a workflow | Its guide in `apps/docs/src/content/docs/docs/` (`use/`, `get-started/` or `run/`). Guides quote the app's labels exactly |
| The API: a route, a schema, a permission | `pnpm --filter @merran/server openapi`, then `pnpm --filter @merran/web api` and `pnpm --filter @merran/extension api` (the two `schema.d.ts` files must match). The site's API reference is built from `openapi.json`; its `api/index.md` needs updating when sign-in, errors or conventions change |
| The database's entities | `pnpm --filter @merran/server db:migration <name>`, which writes one for SQLite and one for Postgres. A running dev server applies a new migration at once, so if you make it again, give it back its first name |
| A setting or environment variable | `pnpm --filter @merran/docs settings:generate` (the site's typecheck fails until it's current), `.env.example` if people set it there, and the site's `run/configuration.md` if it's one people need |
| Running or installing it: the Dockerfile, `compose.yaml`, ports, the data folder | `README.md` ("Run it"), the site's `get-started/install.md` and `run/updating-and-backups.md`, `.env.example`, and `docs/operations.md` |
| The browser extension | `apps/extension/README.md`, and its guide on the site |
| The telemetry summary (`packages/shared/src/telemetry/`) | The receiver takes it first: `apps/telemetry` deploys from main, before the release that sends a new field. Its README, the site's `run/telemetry.md`, and the totals page (`apps/docs/src/pages/telemetry.astro`) if the totals change |
| Something the homepage says (`apps/docs/src/components/landing/`) | Check it's still true when the feature it's about changes |
| A decision | The doc in `docs/` it belongs to, with the date it was decided |

The public site describes the latest release. Mark anything newer as not released yet.

## Pull requests and releases

- **A pull request's title starts with its kind:** `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `perf:`, `test:`, `build:` or `ci:`, `chore(deps):` for dependencies, and a `!` for a breaking change (`feat!: ...`). A check holds every pull request to this, and Release Drafter lists each one under that heading in the next release's notes (`.github/release-drafter.yml`). The `skip-changelog` label leaves one out.
- **Commit messages** are plain English: what changed, and why. They don't need a type.
- **Releases** are made only by running the Release workflow on main ([docs/operations.md](docs/operations.md#releases-and-updates)). Don't tag or publish a release by hand.
- **Never commit** keys, `.env`, a server's data folder, or anything local: files named `*.local` and the `.local/` folder stay on your machine.
