# Imports through FlareSolverr

October 28, 2026. This plans [#51](https://github.com/merran-app/merran/issues/51), split from [#49](https://github.com/merran-app/merran/issues/49). Built the same day, after alpha.6, and not released yet; the public site marks it so.

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

1. `importLink` fetches the page directly, as today.
2. It asks FlareSolverr only when the module is on and the fetch threw `site_refused`: a 403 or 429, or Cloudflare's check, an answer with its `cf-mitigated: challenge` header. The fetcher counts that header as the site turning Merran away everywhere, so background reads leave a site behind Cloudflare's check alone for a while too, as they do after a 403. Any other failure is handled as today.
3. It sends `{"cmd": "request.get", "url": <the link>, "maxTimeout": 55000}` to `<address>/v1`, through the fetcher with `homeNetwork`. FlareSolverr can take most of a minute, so the fetcher gets a `timeoutMs` option (15 seconds unless set), 60 seconds here.
4. With `status: "ok"` and a `solution.status` below 400, `solution.response` (the page's HTML) and `solution.url` (where it ended up) go to `importHtml` as a fetched page would. Recipe data, AI reading and the duplicate check by final link all work as today.

FlareSolverr opens a temporary browser for each request without a `session`, which is enough. Sessions would be faster for many links from one site, but they're browsers left running on someone's server; leave them out unless pasted links are too slow without them.

## Keeping the home network out

FlareSolverr's browser can reach whatever its container can, and the fetcher's address checks don't apply inside it. So:

- **Before:** the link goes through `checkPublicLink`, which looks its name up again and refuses it unless every address is public. The direct fetch has already reached it through the public agent too.
- **After:** `solution.url` goes through `checkPublicLink` as well, and a page that ended up on a private address, or on a name this server can't look up, is refused with the private-address error, even though FlareSolverr fetched it. A site can't steer FlareSolverr's browser onto the home network and have Merran import what it found.
- **The guide says** what's left: the browser inside FlareSolverr can still reach the network it runs on, so run it on a network of its own if that worries you.

## Photos

Photos are fetched as today, with Merran's own user agent and the page as the referer. FlareSolverr hands back HTML, not images. Using its cookies and user agent for photos would mean Merran dressing as Chrome, which is what the REFERENCE app did and the principle rules out. A refused photo means the recipe comes in without one, as a missing photo does today.

## When it doesn't work

| What happens | What the person sees |
|---|---|
| The module is off | Today's message: "That site turned Merran away. Type the recipe in instead." |
| FlareSolverr answers `status: "error"`, times out, or its page is still a 403 or 429 | "That site turned Merran away, even through FlareSolverr. Import it with the browser extension, or type it in." |
| FlareSolverr can't be reached | The same; **Test** in Settings says "Couldn't reach FlareSolverr at \<address\>." |
| Something else answers at the address | **Test** says "That address answered, but not like FlareSolverr does." |
| Its page has no recipe data and there's no AI | Today's message for a page with no recipe data |

## Where it is

- `services/fetch/flaresolverr.ts`: `solvePage` and `checkFlareSolverr`, with tests against a fake FlareSolverr for what's sent, the address with or without `/v1`, its failures, and private links before and after
- `services/fetch/public-fetch.ts`: `checkPublicLink`, the `timeoutMs` option, and Cloudflare's header counted as turned away, each tested against a local server
- `services/recipes/import/import-link.ts`: `fetchPage`, the one place an import falls back to FlareSolverr. Feed reads, collections and Discover open pages through `openPage` and `readFeed`, which never see the setting
- `modules/flaresolverr/`, and `POST /api/settings/server/flaresolverr/test`, for server admins
- The web app's FlareSolverr card under **Recipe services**, checked in the browser against a stand-in that answers `sessions.list`
- `compose.yaml` has a `flaresolverr` profile, like Kokoro's `voice`
- The site's [FlareSolverr guide](../apps/docs/src/content/docs/docs/integrations/flaresolverr.md) covers an existing FlareSolverr, the profile, other Compose files, `docker run`, and keeping it to its network

No new entities, so no migration.

## Checked with a real FlareSolverr — October 28, 2026

FlareSolverr 3.5.2 in Docker, with a throwaway Merran running this branch:

- **Allrecipes** answered Merran's own requests with Cloudflare's check (a 403 with `cf-mitigated: challenge`) on recipe pages, though not on every request. Pasted as a link, a recipe went through FlareSolverr in about 4 seconds and came in with its photo. FlareSolverr's browser wasn't even challenged: the check stops visitors that aren't browsers.
- **taste.com.au** answers Merran with Akamai's 403. Through **Add from link**, a recipe took 21 seconds in FlareSolverr and came in with its photo, ingredients, steps and the site's nutrition. Both sites' photo hosts let Merran's own requests through.
- FlareSolverr reports a page's status as 200 even when the page is the site's 404 page. Such a link ends with Merran's message for a page with no recipe data, which is fair.
