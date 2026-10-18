# The telemetry receiver

The small service that takes in the opt-in daily summaries Merran servers send (see [operations.md](operations.md#2-telemetry-for-the-merran-project-opt-in)), keeps as little as it can, and shows the totals on a public page, like Home Assistant's analytics.

Status: live since October 18, 2026. The receiver is `apps/telemetry`, deployed to `telemetry.merran.app` by its workflow on each change to main. `RECEIVER_LIVE` in `apps/server/src/modules/telemetry/receiver.ts` is on, so 0.1.0-alpha.2 offers telemetry, asks after setup and sends. The [decisions](#decisions) were made as recommended on October 17, 2026.

## Why now

0.1.0-alpha.1 shipped on October 17, 2026 with the sender (`apps/server/src/modules/telemetry/`), which posts to `https://telemetry.merran.app/v1/reports` at 04:41 server time each day. Nothing answers there: the name doesn't resolve. A server whose admin turned telemetry on gets one failed job a day ("Sending the daily summary", in Settings → This server → Jobs). Scheduled jobs are tried once, so it stays at one, and nothing else breaks. [Until it's live](#until-its-live) covers what to do meanwhile.

## What it isn't

- **Not a general analytics service** (PostHog, Plausible, Google Analytics). Those keep addresses, sessions or devices; this keeps one row per server, made of what the server chose to send.
- **Not a log of reports.** Each server has one row, replaced by its next report. There's no history of what one server sent, only daily totals.
- **Not proof.** Anyone can post a made-up report, so the totals are an honest estimate. [Rate limits](#rate-limits-and-made-up-reports) make inflating them work and noticeable, not impossible.

## What a report holds

Exactly what Settings → This server → Telemetry shows (`buildReport` in `report.ts`):

```json
{
  "installId": "6f1c3e1a-0b6e-4d2a-9a43-3f6d2b8f0c11",
  "version": "0.1.0-alpha.1",
  "install": "docker",
  "arch": "arm64",
  "database": "sqlite",
  "modules": { "ai": true, "nutrition": false, "photos": true, "sites": true, "stores": false, "telemetry": true, "updates": true, "video": false, "voice": false, "errorTracking": false },
  "aiProviders": ["anthropic"],
  "households": "1",
  "people": "2-5",
  "recipes": "100-499"
}
```

`aiProviders` is new since 0.1.0-alpha.1 ([decision 6](#decisions)): the kinds of AI provider with a key anywhere on the server, the server's or a household's, never the keys or models. The receiver takes summaries without it, from 0.1.0-alpha.1, and counts them apart. The server's language and country, which [operations.md](operations.md#2-telemetry-for-the-merran-project-opt-in) once listed, aren't sent: Merran has no such settings.

## What it keeps

Two tables, in one database:

| Table | One row per | Holds | Kept |
|---|---|---|---|
| `installs` | install id | The report's fields, as sent; the day it first reported and the day it last reported (UTC dates, no times) | Until 30 days after its last report |
| `days` | day | That day's totals: how many servers reported in the past week, and how many by version, install method, architecture, database, each module, and each size range. No install ids | For good, so the page can show change over time |

A third, small table counts rejected reports per day and reason (`rejections`: day, reason, count), so a sender bug shows up without keeping the reports themselves.

**The report's fields are the limit.** The two dates are the only things added, and they're needed: one to know when to delete a row, the other to count new servers.

**Never kept:** the IP address, the user agent, any other header, the time of day, request logs. The code reads the address once, to hand it to Cloudflare's rate limiter, which counts in memory and writes nothing ([below](#rate-limits-and-made-up-reports)). The Worker's logs stay off (`observability` off in its config), so Cloudflare keeps no request log for it either. Cloudflare does see each address to deliver the request, as any host would, and the public page says so plainly.

### An install id that stops reporting

- **Counted while it's reported in the past 7 days.** Servers send daily, so a week rides out a server that was off for a few days or missed a run.
- **Deleted 30 days after its last report,** by the daily job. If it reports again after that, it counts as new.
- **Reset in Settings** (Make a new id) or **turning telemetry off** leaves the old id to age out: counted for up to 7 more days, gone in 30. So the server tells the receiver to forget the old id with its next daily run after the admin resets it or turns telemetry off ([decision 3](#decisions)): `DELETE /v1/installs/{installId}`, once, never tried again. It remembers which id the receiver has (`telemetry.reportedId`, an internal setting) to know. The id is a random UUID that only that server and its admin have seen, so no one else can delete it.

## Checking reports

The receiver takes exactly what the sender sends, and nothing else:

- **`POST`, JSON, at most 4 KB.** A report is about 400 bytes.
- **One schema for both ends.** The report's Zod schema, its size bands and `rangeOf` move to `packages/shared/src/telemetry/`. The server builds reports with it, the receiver checks them with it, and a server test checks that `buildReport`'s output passes.
- **Each field checked:**
  - `installId`: a UUID
  - `version`: a semantic version, at most 64 characters (releases, `0.0.0-edge.<commit>`, a source build's package version)
  - `install`: `docker` or `source`
  - `arch`: one of Node's `os.arch()` values
  - `database`: `sqlite`, or `postgres` and a major version
  - `modules`: at most 40 ids (a lowercase letter, then letters, up to 32), each `true` or `false`
  - `households`, `people`, `recipes`: one of v1's exact ranges (`0`, `1`, `2-5`, `6-20`, `21+` for households; `0`, `1`, `2-5`, `6-20`, `21-100`, `101+` for people; `0`, `1-99`, `100-499`, `500-1999`, `2000+` for recipes)
- **A field it doesn't know is refused,** not dropped (module ids aside: a new module is just another id). So a release can't start sending something the receiver's public code doesn't account for: a new field is added to the receiver first, and deployed before the release that sends it.
- **The answers:** `204` stored; `400` with a one-line reason; `413` too big; `415` not JSON; `429` too many, with `Retry-After`; `410` for a path version that's been retired (so an old sender can say so, [below](#changes-to-the-sender)).
- **Once a day per server.** A second report on the same UTC day replaces the first, so nothing counts twice, and a server that sends again after a restart is harmless.

## Rate limits and made-up reports

- **Per address:** 10 reports a minute, with Cloudflare's rate limiting binding. It counts in memory at each Cloudflare location and is approximate, which is all it's for: loops and floods. Servers sharing an address (a carrier's NAT) send at different minutes, so 10 is generous.
- **Spikes in new servers:** the daily job compares the day's new ids with the past 30 days. Over five times the usual (and at least 100), it marks the day, the page shows a note, and the maintainers can drop that day's new ids by hand.
- **Only real versions by name:** the daily job reads Merran's releases from GitHub (one request). A version that's a release shows as itself, edge builds as "Edge", and anything else as "Other builds".
- **Small groups stay hidden:** a value only shows by name when at least 5 servers report it; fewer go into "Other". The page names only the modules it knows; other module ids are counted but not shown. This protects the few servers in an unusual setup and blunts made-up values.
- **Beyond that,** Cloudflare's own flood protection covers the domain, and the free plan's daily cap (below) is a ceiling: past it, reports that day are refused until midnight UTC, and nothing else is affected.

## The API

| Route | For | Answers |
|---|---|---|
| `POST /v1/reports` | A server's daily report | `204`, or an error above |
| `DELETE /v1/installs/{installId}` | A server forgetting its old id ([decision 3](#decisions)) | `204`, whether or not there was a row |
| `GET /v1/totals` | The public page: the latest day's totals | JSON, cached for an hour, readable from any site (CORS) |
| `GET /v1/history` | The public page's charts: one entry per day | JSON, cached for an hour, readable from any site |
| `GET /` | People who type the address | A redirect to the public page |

`GET /v1/totals` looks like this (made-up numbers):

```json
{
  "day": "2026-11-02",
  "servers": 412,
  "new": 9,
  "flagged": false,
  "versions": { "0.1.0-alpha.3": 301, "0.1.0-alpha.2": 88, "Edge": 11, "Other builds": 12 },
  "install": { "docker": 395, "source": 17 },
  "arch": { "x64": 330, "arm64": 82 },
  "database": { "sqlite": 371, "postgres 17": 30, "postgres 18": 11 },
  "modules": { "ai": 280, "photos": 120, "sites": 390, "updates": 401 },
  "households": { "1": 350, "2-5": 58, "Other": 4 },
  "people": { "1": 120, "2-5": 270, "6-20": 22 },
  "recipes": { "1-99": 140, "100-499": 190, "500-1999": 70, "2000+": 12 }
}
```

`GET /v1/history` is a list of `{ day, servers, versions }`, which is enough for the two charts that change over time. The receiver isn't part of Merran's API, so it's not in Merran's OpenAPI spec or the site's API reference; `apps/telemetry/README.md` documents it.

## Where it runs

| | Cloudflare Worker with D1 | A Node container and SQLite on a small VPS | A Fly.io machine with a volume |
|---|---|---|---|
| **Monthly cost** | **Nothing** on the free plan: 100,000 requests a day; D1 free gives 100,000 rows written a day (a report writes its row and an index, so 2 or 3), 5 million read and 5 GB. That's about 30,000 reporting servers. Past that, Workers Paid is $5 a month for millions | Hetzner CX23 (2 vCPU, 4 GB) €5.49 ($6.49) plus an IPv4 address, after Hetzner's two price rises in 2026; its cost-optimized servers showed as unavailable to order on October 17, 2026. Others cost more | About $2.19 for the smallest machine (shared CPU, 256 MB) and $0.15 for a 1 GB volume; no free allowance |
| **The code** | Hono, as [stack.md](stack.md) planned; D1 is SQLite, through its own binding | Hono on Node, like the server | Hono on Node, like the server |
| **`telemetry.merran.app`** | One line in its config (merran.app's DNS is already at Cloudflare) | An `A`/`AAAA` record, and Caddy for HTTPS | A `CNAME` and a certificate Fly makes |
| **Upkeep** | None: no OS, no TLS, D1 keeps its own point-in-time restore | OS updates, backups, monitoring, an SSH key in CI, a box open to the internet; access logs must be turned off to keep addresses out | Little; volume snapshots are daily |
| **Against** | Cloudflare-only pieces (D1, the rate limiter, its cron); reports pass through Cloudflare | Cost and upkeep, for one request per server per day | A single machine and volume; a few dollars for what the free option does |

Running it on the maintainer's own home server, behind a Cloudflare Tunnel, would cost nothing too, but ties a public service to one home's power and internet, and mixes the project's infrastructure with someone's own.

**Recommended: the Cloudflare Worker with D1.** It costs nothing at Merran's size and for a long while after; the domain is already there; there's nothing to patch or back up by hand; and Home Assistant's receiver is a Worker too. The Cloudflare-only parts are kept to a thin layer (the entry point, the bindings), so it could move to Node and SQLite in a day: D1 speaks SQLite, and the routes are plain Hono. The demo ([operations.md](operations.md#a-public-demo)) will need a real server, but the receiver shouldn't depend on it: the demo resets nightly and runs AI.

## The code

`apps/telemetry`, AGPL like the rest ([open-source.md](open-source.md)):

- **Routes mirror the API,** as in the server: `src/routes/v1/reports/post.ts`, `src/routes/v1/installs/[installId]/delete.ts`, `src/routes/v1/totals/get.ts`, `src/routes/v1/history/get.ts`.
- **`src/daily/`** for the daily job, and `src/index.ts` with the Worker's `fetch` and `scheduled` handlers.
- **`migrations/`** in SQL, D1's own (`wrangler d1 migrations`), for its four small tables (the three above, and the releases it knows). It's the one place in the repo with a schema in SQL: MikroORM doesn't run on D1, and it's one database, not two ([decision 8](#decisions)).
- **`src/env.ts`** types only the parts of D1 and the rate limiter it uses, so the same code runs on Node's SQLite in tests, without Cloudflare's own types.
- **`wrangler.jsonc`**: the D1 binding, the rate limiter, the cron (`15 0 * * *`, UTC), the custom domain, observability off, Wrangler's own usage reports off.
- **Tests** with Vitest on Node's built-in SQLite and the same migrations (Cloudflare's Vitest pool doesn't support Vitest 5 yet): reports refused and taken, the same day replacing, the daily totals, deleting after 30 days, "Other" under 5. `wrangler dev --test-scheduled` runs it under workerd on a local D1, which is how its SQL was checked on D1 itself.
- **Wrangler** is pinned in the package. Its esbuild and workerd come prebuilt for each platform, so their install scripts are denied in `pnpm-workspace.yaml` (`allowBuilds`), which pnpm 12 needs said.
- **Scripts:** `typecheck`, `test`, `deploy`, and `worker` for running it locally. Not `dev`: the root's `pnpm dev` runs every package's `dev`, and Merran doesn't need the receiver to run.

### The daily job

At 00:15 UTC:

1. Reads Merran's releases from GitHub, to name versions, and adds them to those it knows, so GitHub being down doesn't matter.
2. Counts the servers that reported in the past 7 days, by each field, in SQL (so the free plan's 10 ms of CPU a run isn't a limit), and writes yesterday's row in `days`, with the new-server count, its spike flag and the day's rejections.
3. Deletes servers that haven't reported in 30 days.

`GET /v1/totals` reads the newest row, so the page shows yesterday's totals, updated once a day.

## Pointing `telemetry.merran.app` at it

`merran.app` is registered at Cloudflare and uses its nameservers (checked October 15, 2026). A Worker's custom domain is one entry in `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "telemetry.merran.app", "custom_domain": true }]
```

The first deploy makes the DNS record and the certificate. `.app` is HTTPS-only (it's on browsers' HSTS preload list), which a custom domain handles by itself. Nothing else changes in DNS.

## Deploying from CI

A new workflow, `.github/workflows/telemetry.yml`:

- **Pull requests** are checked by CI like everything else: `check.yml` typechecks and formats it with the rest, and runs its tests.
- **On a push to main** that touches `apps/telemetry/**`, the shared telemetry schema or versions, or the lockfile, and by hand: its tests again, then `pnpm --filter @merran/telemetry run deploy`, which applies the database's migrations (`wrangler d1 migrations apply merran-telemetry --remote`) and then deploys the Worker. Wrangler is the package's own, so no third-party action is needed. It runs in a GitHub environment, `telemetry`, holding `CLOUDFLARE_API_TOKEN` (allowed only to edit Workers, D1 and merran.app's Worker routes) and `CLOUDFLARE_ACCOUNT_ID`.
- **Deployed on merge, not with Release** ([decision 5](#decisions)): the receiver has to accept a new field before a release sends it, so it should never be behind main.
- **Off until it's set up:** the job runs only when the repository variable `TELEMETRY_DEPLOY` is `true`, so main doesn't fail before Cloudflare is ready.

Once, by hand, in the Cloudflare account that holds merran.app: make the database (`wrangler d1 create merran-telemetry`, then its id goes in `wrangler.jsonc` in place of the zeros), make the API token, add the two secrets to the environment, and set `TELEMETRY_DEPLOY`. [apps/telemetry/README.md](../apps/telemetry/README.md#deploying) has the steps.

## The public page

On the site, at `merran.app/telemetry` ([decision 4](#decisions)): a Starlight page (`apps/docs/src/pages/telemetry.astro`) that fetches `/v1/totals` and `/v1/history` in the browser, so it's current without rebuilding the site (which is deployed by hand). `telemetry.merran.app` itself redirects there.

It shows:

- **Servers** that reported in the past week, and a line of that over time.
- **Versions:** each version's share now. `/v1/history` keeps each night's versions too, for a chart of how fast servers update once there are enough nights to show it.
- **How it's run:** install method, CPU architecture, database.
- **Modules:** the share of servers with each one on, by its name in the app.
- **AI providers:** the share with a key for each kind, of the servers that say.
- **Size:** households, people and recipes, as bars of the ranges.
- **Above it all:** "Only servers whose admin turned on telemetry. Most don't, so read these as a floor, not a count of everyone." The day it's from, a note on a flagged day, what's sent and what's kept (the site's telemetry guide), and a link to the code.

No map: no country is sent. The bars are plain HTML and the line inline SVG, in the site's colors, with no chart library. Everything from the receiver goes into the page as text, never as HTML.

## Changes to the sender

1. **Share the schema** (above): `packages/shared/src/telemetry/`, with a server test that the report passes it.
2. **Fail quietly.** When the receiver can't be reached, answers `5xx` or `429`, the job finishes as not sent, logged once as a warning, instead of failing. The Telemetry card says when it last went ("Last sent October 18") or that it couldn't reach the Merran project and tries again tomorrow. The job still fails on Merran's own errors and on a `400`, which means this version's reports are being refused and is worth an admin's notice. This needs an internal setting for the last result, like the install id.
3. **Say when a version is retired.** On a `410`, the card says this version's summaries aren't collected any more and to update Merran, and the job stops failing.
4. **Keep the version in the path.** It's `/v1/reports` already. A change the receiver can't take alongside v1 is `/v2/`, with v1 kept until servers have updated.
5. **Forget the old id** on Reset and on turning telemetry off ([decision 3](#decisions)): one `DELETE` with the next daily run, best effort, never retried.
6. **Spread the time.** Every server sent at 04:41 its own time; now each run is a random 0 to 3 hours later (a schedule's `spreadMinutes`). Not needed for capacity; small and kind.
7. **Link the totals** from the Telemetry card ("See the totals from every server").
8. **Ask once, after setup** (decided October 17, 2026, instead of a box on the setup screen, so more people see it and answer): the first time the server admin opens Merran, a dialog asks **Help improve Merran?** with **Yes, send it** and **No thanks**, and says Settings can change it any time. The answer is kept (`telemetry.asked`, internal) and sets the switch, through `POST /api/telemetry/answer`. It isn't asked if the admin has chosen in Settings already or the environment has decided; closing it without an answer asks again next time. Servers already running when `RECEIVER_LIVE` is turned on are asked once too.

Not planned: a setting for the receiver's address. Tests post the sender's own output to the receiver, which covers what a local end-to-end run would.

## Until it's live

- **In the next alpha, hide it:** `RECEIVER_LIVE = false` in `apps/server/src/modules/telemetry/receiver.ts`. The web app reads it from `GET /api/telemetry/status` (`receiving`, and `ask` for the question): the Telemetry card isn't shown, the question isn't asked, and the job returns "not sent" without a request. An admin's choice is kept, so servers that said yes start sending in the release that flips the constant; they agreed to exactly this summary. `MERRAN_TELEMETRY` still works, so `off` stays off.
- **alpha.1 servers** keep failing one job a day until the receiver answers, whatever the next alpha does. Deploying the receiver quiets them by the next day.

## Slices

1. **The stopgap:** hide the card and stop sending, behind the constant.
   *Done when:* a fresh server shows no Telemetry card and its job sends nothing.
   *Built.*
2. **The receiver, live:** the shared schema, `apps/telemetry`, the database, the workflow, the domain.
   *Done when:* the server's own report, posted to `telemetry.merran.app`, answers `204`, and the next morning's `/v1/totals` counts it.
   *Built,* and checked locally under workerd: a summary taken, a bad one turned down, the night's totals and history read back, releases read from GitHub. Not deployed: that waits for the Cloudflare setup.
3. **The sender, finished:** failing quietly, the last result on the card, `410`, forgetting the old id, the spread, the link, the question after setup; the constant flipped.
   *Done when:* the dev server's report arrives, the card says when, and an unreachable receiver leaves no failed job.
   *Built;* `RECEIVER_LIVE` on since October 18, 2026, once the receiver answered.
4. **The public page,** and the site's telemetry guide (what's sent, what's kept, turning it off, the totals), quoting the app's labels.
   *Done when:* `merran.app/telemetry` shows the dev server among the totals, and the site's build passes.
   *Built:* the page says there are no totals until the receiver has some.

## Risks

- **Made-up reports:** the totals are estimates, said so on the page; the per-address limit, the spike flag, release-only version names and the 5-server floor keep junk small and visible.
- **Leaning on Cloudflare:** a thin layer over the Cloudflare-only parts, and D1 is SQLite, so moving is a day's work.
- **The two ends drifting apart:** one shared schema, a test on the sender's output, and the receiver deployed on merge, before any release that sends something new.
- **Trust:** the code is public, the page says what Cloudflare sees, and nothing is kept that the report didn't hold.

## Decisions

Made on October 17, 2026, as recommended:

| # | Decision | Choice |
|---|---|---|
| 1 | Where it runs | **A Cloudflare Worker with D1:** free at this size, merran.app's DNS is already there, nothing to maintain. The alternatives are a VPS (about €6 a month and upkeep) or Fly.io (about $2.50 a month) |
| 2 | How long a quiet server counts, and when it's deleted | **Counted for 7 days after its last report, deleted after 30** |
| 3 | Forgetting the old id on Reset and on turning telemetry off | **Yes:** one `DELETE`, best effort, with the next daily run, so the row goes within a day rather than in 30 |
| 4 | Where the public page lives | **`merran.app/telemetry`, on the site,** reading the receiver's JSON, rather than a page the Worker serves |
| 5 | When the receiver deploys | **On every merge to main that changes it,** rather than by hand like the site, so it's never behind a release |
| 6 | operations.md lists AI provider kinds, language and country; the sender sends none of them | **Send the AI provider kinds** (which providers to support first); **drop language and country** until Merran has those settings, and say so in operations.md |
| 7 | The stopgap | **Hide the card and stop sending until the receiver is live;** no placeholder, since the receiver itself is ready to deploy |
| 8 | The receiver's tables in SQL migrations, against "never written in SQL" | **Yes, as the one exception:** MikroORM doesn't run on D1, and it's one small database, not two |
