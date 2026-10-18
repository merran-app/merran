# Merran's telemetry receiver

The small service at `telemetry.merran.app` that takes the anonymous daily summaries Merran servers send when their admin turns telemetry on, keeps as little as it can, and works out the totals the [public page](https://merran.app/telemetry) shows. It runs on Cloudflare Workers with a D1 database. The plan, and why it's built this way, is [docs/telemetry.md](../../docs/telemetry.md).

## What it keeps

- **One row for each server that reports:** the summary's own fields (its random install id, version, how it's installed, CPU, database, which modules are on, which kinds of AI provider have a key, and counts as ranges), the day it first reported and the day it last reported. Each summary replaces the last. A row is deleted 30 days after its last report, or as soon as the server asks: after a new install id, or turning telemetry off.
- **Each night's totals,** with no install ids, kept for good.
- **Summaries turned down,** counted by day and reason, never the summaries themselves, for 30 days.
- **Never:** IP addresses, user agents or other headers, times of day, request logs. The address is only the rate limiter's key, counted in memory by Cloudflare. The Worker's logs are off. Cloudflare sees each address to deliver the request, as any host would.

The tables are in [migrations/](migrations/).

## The API

| Route                             | For                                                          | Answers                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/reports`                | A server's daily summary, as JSON, at most 4 KB              | `204`; `400` with `{ "error" }` saying what's wrong; `413` too big; `415` not JSON; `429` too many from one address in a minute, with `Retry-After` |
| `DELETE /v1/installs/{installId}` | A server forgetting its old id                               | `204`, whether or not there was a row                                                                                                               |
| `GET /v1/totals`                  | The newest night's totals                                    | JSON, or `404` before the first night; cached for an hour, readable from any site                                                                   |
| `GET /v1/history`                 | Up to two years of nights: `{ day, servers, versions }` each | JSON, cached for an hour, readable from any site                                                                                                    |
| `GET /`                           | People who type the address                                  | A redirect to the public page                                                                                                                       |

A summary must match the schema in [`packages/shared/src/telemetry/report.ts`](../../packages/shared/src/telemetry/report.ts), which the server builds its summaries with, and nothing else: a field the receiver doesn't know is turned down. So a new field is added here first, and deployed before the release that sends it.

The totals count servers that reported in the 7 days to that night. Versions are named only if they're releases on GitHub ("Edge" for edge builds, "Other builds" for the rest), and any value fewer than five servers report is folded into "Other". A module or AI provider is only named once five servers mention it.

## Working on it

From the repository's root:

- `pnpm --filter @merran/telemetry test` runs the tests, on Node's SQLite with the same migrations.
- `pnpm --filter @merran/telemetry worker` runs it at http://localhost:8787 on a local D1. Add `--test-scheduled` to `wrangler dev` to run the night's totals from `/__scheduled`.
- `pnpm --filter @merran/telemetry typecheck`.

Merran's `pnpm dev` doesn't start it: a Merran server doesn't need it.

## Deploying

The Telemetry receiver workflow (`.github/workflows/telemetry.yml`) tests and deploys it whenever main changes it: the database's migrations, then the Worker. It does nothing until it's set up, once, in the Cloudflare account that holds `merran.app`:

1. Sign in and make the database, from the repository's root:

   ```bash
   pnpm --filter @merran/telemetry exec wrangler login
   pnpm --filter @merran/telemetry exec wrangler d1 create merran-telemetry
   ```

   Put the `database_id` it prints into `wrangler.jsonc` in place of the zeros, and commit it. It isn't a secret.

2. In Cloudflare, make an API token that can edit Workers scripts, D1 and Workers routes for the `merran.app` zone (the "Edit Cloudflare Workers" template, plus D1 edit).
3. In GitHub, make an environment called `telemetry` with two secrets, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and set the repository variable `TELEMETRY_DEPLOY` to `true`.
4. Run the Telemetry receiver workflow from the Actions tab, or deploy from your own machine with `pnpm --filter @merran/telemetry run deploy`.

The first deploy makes `telemetry.merran.app`'s DNS record and certificate. Then turn on `RECEIVER_LIVE` in `apps/server/src/modules/telemetry/receiver.ts`, so the next release offers telemetry and sends to it.
