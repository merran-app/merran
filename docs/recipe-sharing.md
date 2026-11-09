# Recipe sharing

Planned November 8, 2026, and implemented the same day. This scopes "Recipe sharing outside the household" in [features.md](features.md): send one recipe to friends and family as a link, through the phone's share sheet (Messages, Mail and the rest) or by copying it, so they can read it and cook from it without an account. They can't change it, and they can't use Merran's AI.

Implemented November 8, 2026: the share routes, the public routes and the head, the **Share** button, panel and **Shared** badge, the admin switch and list, the shared page and its cook mode, and the guide. The real-phone checks under Tests are still to do.

## Goal

Someone in a household taps **Share** on a recipe and sends it the way they send anything else from their phone. The person who opens the link sees the recipe, scales it, switches units and cooks from it, timers and all. Nothing about the household beyond that one recipe is visible, and nothing they do changes the recipe or costs the household anything.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| What a link shows | The recipe as it is now, one link per recipe | Fixes reach everyone who has the link; there's one thing to stop sharing |
| Who can share | Anyone in the household who can read recipes; an admin can turn sharing off | Matches calendar subscriptions ([calendar-subscriptions.md](calendar-subscriptions.md)) |
| Turning sharing off | Pauses every link (they answer 404) without deleting them; turning it back on brings them back | One switch, nothing to recreate |
| Stop sharing a recipe | Deletes the share; sharing again makes a new token. The recipe column is unique, so a double-tap can't make two links | A link someone shouldn't have stays dead, and there's no revoked row to filter out (November 8, 2026) |
| API keys | Making or stopping a share needs `recipes:write`; reading one needs `recipes:read`. Signed-in members are unchanged | A key that can only read recipes can't open them to the world |
| The member who shared leaves | The share stays, owned by the household, and an admin can stop it | A link people were sent shouldn't break because someone moved on |
| The token | Stored as itself, not as a hash | The same link has to be shown again each time someone shares it. It grants read access to one recipe the household chose to share, like a document's "anyone with the link" |
| Saving a copy | schema.org `Recipe` data in the shared page's HTML, so Import from a link (on any Merran server), the browser extension and other recipe apps can take it | No accounts or servers to link; it works with everything that already imports recipes |
| How the page is built | A page in the web app at `/r/{token}` that reuses the recipe and cook views in a guest mode, with the server filling in the HTML head for link previews and recipe data | Recipients get the real cooking experience; previews and importers don't run JavaScript, so what they need is in the HTML the server sends |
| Ruled out | A guest session in the normal app | Every route and permission would need a guest case, and one gap would leak household data |
| Ruled out | A standalone page made on the server | Simpler, but scaling, units, cook mode and timers would have to be built twice or left out |

## The server

### Data

- `RecipeShare`, household-scoped: the recipe, a 43-character random URL-safe token, who created it (set to null if that member is deleted, so the share outlives them), created at, last opened at (updated at most once an hour, so reads don't write on every visit). **Stop sharing** deletes the row rather than setting a "revoked at", and the recipe column is unique, so a recipe has at most one share.
- A household setting, **recipe sharing**, on by default, next to the household's other settings.
- One migration for SQLite and one for Postgres (`pnpm --filter @merran/server db:migration recipe-shares`).

### Routes for the household

Session or API key, with recipe-read permission to read and `recipes:write` to make or stop a share (API keys; signed-in members are unchanged), in `apps/server/src/http/routes/recipes/[recipe]/share/`:

- `GET /api/recipes/{recipe}/share`: the active link, or none.
- `POST /api/recipes/{recipe}/share`: the active link, made first if there isn't one. Calling it again changes nothing. Refused while the household has sharing off.
- `DELETE /api/recipes/{recipe}/share`: stop sharing.

For admins:

- `GET /api/households/current/shares`: every shared recipe, who shared it, when, and when it was last opened. Shares on recipes in Recently deleted stay on the list and can be stopped.
- The household settings `PATCH` gains the sharing switch.

Links are built from `MERRAN_PUBLIC_URL`, never from the request's Host header. Without it, `POST` answers 400 `share_public_url`, while `GET` and the admin list still return their rows with `url: null`, and the app explains the link only works where this server can be reached.

### The public routes

The only routes that don't need sign-in, in `apps/server/src/http/routes/shared/[token]/`:

- `GET /api/shared/{token}`: the shared recipe.
- `GET /api/shared/{token}/photo`: its photo, streamed from the same file the recipe's photo route serves. Recipe photo routes stay behind sign-in.

Both, like the calendar feed:

- `security: []` in OpenAPI; they don't look at cookies or API keys, so being signed in changes nothing about what they return.
- Check the token's shape before any lookup, rate-limit per token, and send `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
- Answer the same 404 for an unknown token, a stopped link, a household with sharing off, and a recipe in Recently deleted. Restoring the recipe brings the same link back.
- Redact the token from the request log, for `/api/shared/…` and `/r/…`.
- Resolve the household from the token, then read through `forHousehold` like every other route.

The response is a `SharedRecipe` schema built field by field, not the full recipe with fields removed, so a field added to recipes later isn't shared unless someone adds it here:

- **Included:** title, summary, photo (as the token's photo URL), servings, prep, cook and total times, ingredient groups with each line's parsed quantity, unit and food (so the page can scale and convert), steps, nutrition, diet labels, the original source's name and link, and the household's name for "Shared by".
- **Left out:** IDs, cook notes, ratings, versions, tags, collections, cost and prices, pantry matches, stand-ins and swaps, plan entries, household tastes, who made it and when.

The photo is cached `private, max-age=31536000, immutable` when the `v` query matches the recipe's photo, and `no-store` otherwise. The source's name shows the link's host as its credit.

There are no public routes for stand-ins, swaps, tidy, voice, nutrition lookups, saving or editing, so the shared page has nothing to call even if someone changes it in their browser.

### The HTML head

`apps/server/src/http/web-app.ts` serves `index.html` for every other path. For `/r/{token}` and `/r/{token}/cook`, it fills in the head before sending it:

- `og:title`, `og:description` (the summary, or "A recipe from The Johnsons"), `og:image` (the token's photo URL, absolute), `og:url`, `og:type`, `twitter:card` as `summary_large_image`.
- `<meta name="robots" content="noindex">`, so shared recipes stay out of search engines.
- A `<script type="application/ld+json">` with the schema.org `Recipe`: name, description, image, `recipeYield`, times in ISO 8601, `recipeIngredient` as the lines' text, `recipeInstructions` as `HowToStep`s, `nutrition`, and `author` as the household's name.
- Text is escaped for HTML attributes, and the JSON-LD escapes `<` so a title like `</script>` can't end the block.

Filled `/r/` pages also send `Referrer-Policy: no-referrer`. A link-preview fetch of `/r/` doesn't count as an open; only the page's own API call does. For a token that doesn't resolve, the head is left as it is, and if the lookup itself fails, the plain app page is served.

## The web app

### Sharing a recipe

- A **Share** button in the recipe page's header, and **Share** in the recipe menu (`apps/web/src/features/recipes/recipe-menu.tsx`), which also reaches cards' right-click menus.
- The recipe page reads `GET …/share` when it loads, so the link is in hand when Share is tapped. Share then:
  1. Makes the link with `POST …/share` if there isn't one.
  2. Calls `navigator.share({ title, text, url })` where the browser has it (iPhone, Android, Safari and Edge on desktop): the phone's own share sheet, so Messages, Mail, WhatsApp, Copy and the rest.
  3. Otherwise copies the link and shows **Link copied**.
  4. Closing the share sheet without choosing is not an error.
- Safari only opens the share sheet straight from a tap. If making the link first loses that on a real iPhone, the first share opens the panel below instead, where **Share…** is a second tap.
- Once a recipe is shared, Share opens a panel (a drawer on phones, a popover on larger screens): the link, **Copy link**, **Share…**, "Anyone with this link can see and cook this recipe. They can't change it.", and **Stop sharing**, which asks first.
- A small **Shared** badge on the recipe page.
- With sharing off for the household, Share isn't shown, and admins see why in Settings.

### Settings

**Settings → Household → Sharing**, for admins: **Let members share recipes by link**, and the list of shared recipes with who shared each, when, and when it was last opened, each with **Stop sharing**.

### What the recipient sees

`/r/$token`, a top-level route outside the signed-in layout:

- A plain header with Merran's mark and **Shared by The Johnsons**.
- The photo, title, summary and times.
- A servings stepper that scales the ingredients, and a US/metric switch remembered on the device, using the shared scaling and units code.
- Ingredients, steps and nutrition through the existing components with a `guest` flag: no stand-ins, swaps, pantry marks, cost, editing or menus.
- **Start cooking**, opening `/r/$token/cook`: `CookView` in guest mode, with steps, timers, the screen kept awake and progress kept on the device. No plan entry, no After cooking, no **Made it**, and no server voice (it's AI). The browser's own speech still reads steps aloud where the device has it.
- At the foot: **Made with Merran**, linking to merran.app, and "Use a recipe app? Paste this link into it to save a copy."
- A link that doesn't work shows **This recipe isn't shared anymore** and nothing else. A recipe already loaded stays on screen until the guest reloads, even if the share is stopped meanwhile.

The page uses only `/api/shared/…` and doesn't start the app's signed-in queries, the guided tours or the assistant.

## Tests

Server tests, on SQLite and Postgres:

- Another household's recipe can't be shared, and its token reads nothing from this household.
- After **Stop sharing**, with sharing off, and once the recipe is deleted, the public routes answer 404; turning sharing back on brings a link back, and **Stop sharing** doesn't.
- The response's fields match an allowlist exactly.
- The photo route refuses a token for another recipe.
- Being signed in, or sending an API key, changes nothing on the public routes.
- Rate limits answer 429 with `Retry-After`.
- The head's tags and JSON-LD escape hostile titles and summaries, and the JSON-LD imports back through Merran's own link importer.
- `POST …/share` twice gives one link; after **Stop sharing**, it gives a new one.

By hand:

- A desktop browser check passed on November 8, 2026. It ran in headless Chrome at desktop and phone widths, on a copy of the dev data: sharing, the panel, previews, the guest page and cook mode, stopping, and the admin switch.
- Still to do on real phones: an iPhone and an Android share sheet, previews in Messages, Mail, WhatsApp and Slack, and importing into a second household.

The full list:

- The share sheet on an iPhone and an Android phone, from Safari, Chrome and the installed app.
- Link previews in Messages, Mail, WhatsApp and Slack.
- Importing a shared link into a second household with Import from a link.
- Cooking from the shared page on a phone with the screen kept awake.

## When it's built

- [features.md](features.md): the row moves to Built.
- `en.json` holds every label; a new guide, `use/sharing-recipes.md`, quotes them, and the recipes and settings guides link to it.
- `pnpm --filter @merran/server openapi`, then the web and extension `api` scripts; the site's `api/index.md` notes the public share routes beside the calendar feed.
- The homepage's feature lists, if they mention sharing.

## Later, if people ask

- Sharing a collection, or a week's plan.
- A link that expires on its own.
- **Add to my recipes** for someone signed in to the same server in another household.
