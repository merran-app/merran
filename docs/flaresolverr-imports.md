# Imports through FlareSolverr — plan

October 28, 2026. This plans [#51](https://github.com/merran-app/merran/issues/51), split from [#49](https://github.com/merran-app/merran/issues/49). It's Planned in [features.md](features.md), not built.

## Why

Self-hosters often run [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) already, for their media stack: a small server that opens a page in a real browser and waits out Cloudflare's checks. Some recipe sites turn servers away, so importing their links fails with "That site turned Merran away." The browser extension imports those pages from the person's own browser, but a link shared from a phone, or sent through the API, goes through the server.

The error #49 reported, "That site sent a broken redirect.", wasn't a site blocking Merran: it was Merran mistaking an unchanged feed's `304 Not Modified` for a redirect ([#50](https://github.com/merran-app/merran/issues/50)). FlareSolverr is for the sites that really do turn Merran away.

## What changes about being honest on the internet

Principle 8 in the [README](README.md#principles) says Merran doesn't try to get past bot blocks, and [platform.md](platform.md#security) leaves sites that block servers to the extension. Decided October 28, 2026: Merran still never tries on its own, but a server admin can point it at their own FlareSolverr, for imports a person asks for. A person importing a page they could open in their browser is what the extension already does; Merran reading sites in the background, past a block a site chose, isn't.

So FlareSolverr is used for:

- **Import from a link**, and pasted links
- Links shared from a phone (Android's share sheet, the iPhone Shortcut)
- `POST /api/recipes/import` and the other ways a person or their API key imports a link

And never for:

- Feed reads for followed sites, starter collections, or the classics' weekly checks: these stay Merran's own user agent and `robots.txt`
- Discover, which opens many pages for an AI search
- Photos: see [Photos](#photos)

## The module

- **`flaresolverr`**, off until the server admin gives FlareSolverr's address. One setting, `flaresolverr.url` (`MERRAN_FLARESOLVERR_URL`): "Where FlareSolverr answers, like http://flaresolverr:8191. It may be on the home network." The same kind of setting as Kokoro's address, fetched with `homeNetwork`, so redirects must stay where they started.
- **Settings → This server** gets a FlareSolverr card: the address (locked when it comes from the environment) and **Test**. Test sends `{"cmd": "sessions.list"}` to `/v1`, which is cheap and documented, and says "FlareSolverr \<version\> is ready." or why not. Route: `POST /api/settings/server/flaresolverr/test`, for server admins.
- **The module's status** is on with an address and off without one, like the others, so the app can say what's missing.
- **Telemetry** reports modules as an open list of ids, so the new module needs nothing from the receiver first.

## How an import uses it

1. `importLink` fetches the page directly, as today, with `keepErrors` so it can see the answer.
2. It asks FlareSolverr only when the module is on and the site turned Merran away: a 403 or 429, or a 503 with Cloudflare's `cf-mitigated: challenge` header. Any other answer is handled as today.
3. It sends `{"cmd": "request.get", "url": <the link>, "maxTimeout": 55000}` to `<address>/v1`, through the fetcher with `homeNetwork`. FlareSolverr can take most of a minute, so the fetcher gets a `timeoutMs` option (15 seconds unless set), 60 seconds here.
4. With `status: "ok"` and a `solution.status` below 400, `solution.response` (the page's HTML) and `solution.url` (where it ended up) go to `importHtml` as a fetched page would. Recipe data, AI reading and the duplicate check by final link all work as today.

FlareSolverr opens a temporary browser for each request without a `session`, which is enough. Sessions would be faster for many links from one site, but they're browsers left running on someone's server; leave them out unless pasted links are too slow without them.

## Keeping the home network out

FlareSolverr's browser can reach whatever its container can, and the fetcher's address checks don't apply inside it. So:

- **Before:** the link goes through `checkLink`, and the direct fetch has already reached it through the public agent, so its name resolved to a public address.
- **After:** `solution.url` is looked up again, and a page that ended up on a private address is refused with the private-address error, even though FlareSolverr fetched it. A site can't steer FlareSolverr's browser onto the home network and have Merran import what it found.
- **The guide says** what's left: the browser inside FlareSolverr can still reach the network it runs on, so run it on a network of its own if that worries you.

## Photos

Photos are fetched as today, with Merran's own user agent and the page as the referer. FlareSolverr hands back HTML, not images. Using its cookies and user agent for photos would mean Merran dressing as Chrome, which is what the REFERENCE app did and the principle rules out. A refused photo means the recipe comes in without one, as a missing photo does today.

## When it doesn't work

| What happens | What the person sees |
|---|---|
| The module is off | Today's message: "That site turned Merran away. Type the recipe in instead." |
| FlareSolverr answers `status: "error"`, times out, or its page is still a 403 or 429 | "That site turned Merran away, even through FlareSolverr. Import it with the browser extension, or type it in." |
| FlareSolverr can't be reached | The same; the server logs a warning naming FlareSolverr's address, and **Test** in Settings says why |
| Its page has no recipe data and there's no AI | Today's message for a page with no recipe data |

## Tests

Against a fake FlareSolverr on a local server, as the home-network fetch test does:

- Asked only after a refusal, and only when the module has an address
- Not asked for feed reads, collections or Discover: those run with FlareSolverr set up and never call it
- Its HTML imports like a fetched page, and its final link counts for duplicates
- A link to a private address is never sent, and a page that ended up on one is refused
- Errors, timeouts and pages it couldn't get past become the messages above
- The Test route, for server admins only

No new entities, so no migration.

## When it's built

- [features.md](features.md): the row goes from Planned to Built, and the public [roadmap](../apps/docs/src/content/docs/docs/project/roadmap.md) moves it out of Planned
- The [README](README.md#principles)'s principle 8 and [platform.md](platform.md#security): say it's built
- `pnpm --filter @merran/docs settings:generate`, `.env.example`, and the site's `run/configuration.md`
- A guide on the site for running FlareSolverr beside Merran, with a compose example and the network advice, and the import guide's word on sites that turn Merran away
- `pnpm --filter @merran/server openapi`, then both `schema.d.ts` files, for the Test route
- `en.json` for the card and the new message
