# Features

Every Merran feature in one list, for the marketing site and the docs site. Each one has an importance and a status, so the site can lead with what matters and only claim what's built.

Keep this page current: when a feature is built, changed, planned or dropped, update its row here in the same change. [scope.md](scope.md) says where each feature lands and when; this page says what it is in words a visitor would use.

**Importance**

- **Headline:** a reason to pick Merran. Leads the home page.
- **Key:** worth its own section or screenshot on a feature page.
- **Detail:** belongs in a feature list or the docs, not a headline.

**Status** (reconciled October 19, 2026 against v0.1.0-alpha.4; see [roadmap audit](site-roadmap-audit.md))

- **Built:** works in the rewrite today.
- **Building:** started in the rewrite, not finished.
- **Planned:** coming in 0.1, not started.
- **Later:** after 0.1.
- **Skipped:** deliberately excluded from the current scope.

## Running it

| Feature | Importance | Status | Notes |
|---|---|---|---|
| Self-hosted and open source (AGPL-3.0) | Headline | Built | Your recipes stay on your server |
| One container, nothing to fill in, SQLite by default | Headline | Built | `docker run` and the setup page appears |
| Postgres for bigger servers | Detail | Built | Same image |
| Move a server from SQLite to Postgres (`merran db copy`) | Detail | Planned | |
| Everything beyond the basics is an optional module | Key | Built | Off until set up; the app says what's missing instead of breaking |
| Health checks for Docker and uptime monitors | Detail | Built | |
| Error tracking to your own Sentry, GlitchTip or Bugsink | Detail | Built | Off unless a DSN is set |
| Opt-in telemetry that shows exactly what it sends | Key | Built | Nothing leaves the server unless the admin turns it on; offered from 0.1.0-alpha.2 |
| The telemetry receiver and public totals page | Detail | Built | Live at `telemetry.merran.app` since October 18, 2026; the page shows totals from the first night's count ([telemetry.md](telemetry.md)) |
| Background jobs that survive restarts, with a jobs page | Detail | Built | |
| Problems page for the server admin | Detail | Planned | |
| Update badge when a new release is out | Detail | Built | GitHub's releases every 6 hours (pre-releases for a server on one), a badge for the server admin in the sidebar and account menu, the notes and update commands in Settings, This server |
| Prebuilt, signed images; releases with notes | Detail | Built | A Release workflow run with a version: images for amd64 and arm64, signed with cosign, with an SBOM and provenance; the extension's zips; notes drafted by Release Drafter from each pull request's title (`feat:`, `fix:`...), under a heading for each kind, with highlights written by hand; selective CI (October 19, not released yet) publishes `edge` for image-affecting changes on main and skips application builds for site-only documentation changes; see [operations](operations.md#selective-ci--october-19-2026-not-released-yet) |
| Automatic backups before migrations | Detail | Planned | Manual backups and restores are available; startup migration currently calls the migrator directly |
| Docker shared runtime dependency verification | Key | Built | Final-image imports verify shared code and telemetry dependencies before CI or release images can be published; workspace dependency links are copied into the runtime image |
| Release installation and backup/restore smoke tests | Detail | Built | SQLite and Postgres tests recorded in [site-release-verification.md](site-release-verification.md); automated restore coverage in CI remains planned |
| Platform-specific installation walkthroughs | Key | Built | Docker Compose, TrueNAS, Dockge, Portainer and Docker CLI tabs; alpha release-channel examples, copyable starter environment, persistent storage guidance and optional-service downloads ([operations.md](operations.md#host-manager-installation-examples--october-17-2026)) |
| Public documentation site | Key | Built | https://merran.app is published; PR #8 adds integration/deployment guides and scoped release verification |
| Unraid template and hosted app demo | Key | Planned | Homepage previews are scripted examples, not a hosted application instance |

## Accounts and households

| Feature | Importance | Status | Notes |
|---|---|---|---|
| Several households on one server, kept fully apart | Headline | Built | Proved by tests generated from the schema |
| Settings grouped by owner and task, with section links | Detail | Built | Not released yet: You, Household, Import and export, and This server use the same section navigation; cards are grouped by what people are trying to change |
| Belonging to more than one household, with a switcher | Key | Built | |
| First-run setup with a code from the log | Detail | Built | Grouped readiness banner, retrieval and recovery guidance; new improvements released in alpha.4 ([onboarding.md](onboarding.md)) |
| Clear setup-code retrieval and recovery from interrupted setup | Detail | Built | Available in alpha.4: operator setup-code command; atomic claiming, concurrent-submission guard and retry/sign-in guidance |
| New-password confirmation and visibility controls | Detail | Built | Available in alpha.4: setup, invitation registration and password changes; inline visibility controls, and a compact responsive setup layout |
| Operator password reset without email | Detail | Built | Available in alpha.4: hidden interactive prompts and session revocation |
| Household setup review and resumable first-meal checklist | Key | Built | Available in alpha.4: time zone, week start, planned meals and household-derived milestones beyond the first recipe; numbered step cards, completed checkmarks, progress count and the next unfinished step highlighted; optional module status tiles and grouped household/server resources |
| Repeatable setup testing in an isolated development database | Detail | Built | Available in alpha.4: MERRAN_DEV_SETUP uses fresh temporary SQLite storage each start; refused in production and Docker |
| Invite links, roles, open sign-up (off by default) | Key | Built | |
| Export your own account's data | Detail | Built | |
| Passkeys | Key | Built | Not released yet: opt-in WebAuthn, required user verification, account management and last-method protection. Operator confirmed Bitwarden registration and sign-in after logout on TrueNAS/Dockge ([authentication](authentication.md)). |
| Two-step sign-in | Detail | Built | Not released yet: TOTP enrollment, single-use recovery codes, operator recovery and mandatory administrator policy across sign-in methods |
| Single sign-on (OIDC) | Key | Built | Not released yet: one operator-configured provider, explicit linking, optional account creation and password policy; no automatic email linking |
| Household invitations by email (SMTP) | Detail | Built | Available in alpha.4: optional SMTP settings and test, address-bound seven-day invitations, queued delivery with retries, resend/cancel and provider-acceptance status; styled HTML with plain-text fallback; requires MERRAN_PUBLIC_URL |
| Password reset by email | Detail | Built | Available in alpha.4: optional SMTP recovery with styled, single-use 30-minute links, durable delivery, rate limits, password confirmation and session revocation; operator recovery remains available |
| Account email verification | Detail | Skipped | Decided October 18, 2026: unnecessary for the intended self-hosted deployment; no verification email or verified-email sign-in requirement. Provider sending-domain verification is separate |
| Encrypted saved secrets and secret rotation | Detail | Built | SecretBox storage and the merran rotate-secret command ship in alpha.1 |
| Audit log | Detail | Planned | Secret encryption and rotation are not an audit trail |
| A limited role for kids | Detail | Later | |

## Recipes

| Feature | Importance | Status | Notes |
|---|---|---|---|
| A recipe library: photos, servings, times, sections, notes, source, rating | Headline | Built | |
| Scaling | Key | Built | |
| Units as written, US or metric, both ways | Key | Built | Per device |
| Versions, with restore | Detail | Built | |
| Tags: rename, merge, delete | Detail | Built | |
| Fast search, filters and sorting, even in big libraries | Key | Built | On the server; tags picked from a searchable list (a bottom sheet on a phone), filters on one row |
| Diet labels worked out from the ingredients, with corrections | Key | Built | |
| Goes with: pair recipes, like chicken with any of your sauces | Key | Built | |
| "I made this", and a New badge for ones you haven't cooked | Detail | Built | |
| How did it go? Stars and notes after cooking | Key | Built | |
| Select and act on many recipes; Recently deleted for 30 days | Detail | Built | |
| Nutrition from the recipe's site | Detail | Built | |
| Nutrition worked out from USDA data or by AI, with plan totals | Key | Built | Module: a free USDA key; AI estimates without one. Worked out by itself when a recipe's saved, and for the whole library. The foods Merran knows have their USDA food checked by hand, so they aren't searched for. Available in alpha.4: free-key signup steps and email/spam guidance in Settings |
| What recipes cost, and a weekly budget, in any currency | Key | Built | Module (stores): each line's share of its product's price at the household's Kroger store (by weight or volume, a baking staple's density, or a can as one can), shown on recipes and cards when three in five lines have a price; the Plan page says what the week comes to against the budget, and Fill the week and the autoplan pick recipes that fit what's left of it more |
| AI photos in a consistent style for recipes without one | Key | Built | Module, off by default; an OpenAI or Google key; four styles per household, one by itself for each new recipe, or the whole library |
| Recipe translations, step photos, meaning-based search | Detail | Later | |

## Cooking

| Feature | Importance | Status | Notes |
|---|---|---|---|
| Cook view for the kitchen counter: get ready, ingredients per step, big text | Headline | Built | |
| Kitchen timers from the steps | Key | Built | |
| Screen stays on, and your place is kept | Detail | Built | |
| Random celebrations when shopping or cooking is finished | Detail | Built | Available in alpha.4: falling showers of confetti, stars or petals after successful list completion/clearing and marking a meal made or cooked; respects reduced motion ([decision](shopping-and-planning-feedback.md#completion-celebrations)) |
| Hands-free: steps read aloud, voice commands | Key | Built | Uses the device's voice |
| A better server voice (Kokoro or OpenAI) | Detail | Built | Module; each step read once and kept; the device's own voice when it can't |
| Swap an ingredient you're out of | Key | Built | AI; for this time or saved to the recipe, with the steps rewritten to match, in cook view too |
| Turn a cooking note into a suggested edit | Detail | Built | AI |

## Adding recipes

| Feature | Importance | Status | Notes |
|---|---|---|---|
| Import from a link | Headline | Built | Honest user agent |
| Type one in | Detail | Built | |
| Paste many links at once | Key | Built | Runs in the background |
| Import from text, photos, PDFs, or pages with no recipe data | Headline | Built | AI; any model that reads images and PDFs |
| Move from Mealie: a backup file, an export, or connecting to it | Headline | Built | |
| Import from Paprika | Key | Built | |
| Merran export and import of a whole household | Key | Built | |
| Share to Merran from Android's share sheet or an iPhone Shortcut | Key | Built | Links, pages, photos, screenshots and PDFs; on Android, once installed from Merran's https address |
| Tidy up: AI fixes a recipe, you review each change | Key | Built | Not released yet: paired previous/proposed line comparisons with changed/added/removed counts, description and detail comparisons, and full recipe previews in Review; recipe Review and Tidy up open in mobile drawers while desktop keeps dialogs. AI; also marks which ingredients a recipe can do without, and names the food of lines Merran doesn't know, for the list |
| Video links (TikTok, YouTube, Instagram, Facebook) | Headline | Built | Module, on by default: yt-dlp and ffmpeg (in the image) and AI; listens to videos without captions on an OpenAI key |
| Follow recipe sites and see their newest recipes | Key | Built | Module, on by default; respects `robots.txt`; on Recipes and Today too |
| Starter collections that fill themselves from recipe sites, fitted to your tastes | Key | Built | Module, on by default; a rule and a few classics per collection, in data files per language; Find more with AI |
| Imports in your language: a recipe from another language translated as it comes in | Key | Planned | AI; a setting, with the app's translations |
| Discover: find recipes for any theme with AI | Key | Built | AI, with web search; each page is opened first, so they all import |
| Browser extension: import a page, right-click, the list in a side panel | Key | Built | Chrome, Edge, Firefox; even sites that turn servers away or need a sign-in; in the stores with 0.1 |
| Tandoor import | Detail | Later | |

## Planning

| Feature | Importance | Status | Notes |
|---|---|---|---|
| A week of meals, with the meals your household eats | Headline | Built | Breakfast, lunch and dinner each optional |
| A pool of meals for the week, cooked in any order | Key | Built | |
| See which recipes are already planned for the week | Detail | Built | Available in alpha.4: Already planned badges in meal and side pickers for the destination week; Planned this week on recipe-library cards. Includes sides and any-day meals, counts cooked meals and excludes skipped ones ([decision](shopping-and-planning-feedback.md#see-recipes-already-planned-for-the-week)) |
| What's next: tonight's dinner, this afternoon's lunch | Key | Built | |
| Fill the week, re-roll, Something else | Headline | Built | No AI needed |
| Saying why for each pick: on hand, needs using, not had lately... | Headline | Built | With the stores module, what's on sale too |
| Tastes and rules | Key | Built | A recipe Merran can't read, like one kept in Arabic, isn't suggested to a household with allergies, and says why |
| Leave it out: dislikes crossed off a recipe instead of ruling it out | Headline | Built | Allergies are never left to chance |
| Theme nights: tacos on Tuesday, eat out on Friday | Key | Built | |
| A week that plans itself on a schedule | Headline | Built | |
| Select meals, repeat last week, clear the rest | Detail | Built | |
| Leaning on sales | Key | Built | Module (stores): Fill the week and the weekly autoplan pick recipes with real deals at the household's Kroger store more, as much as its Lean on sales says (off, a little, a lot), and say so; Recipes has an On sale filter |
| Deals worth having: a sale judged against price history | Key | Built | Module (stores): prices checked each morning and kept by day; each sale is the lowest in a while, a normal sale, or barely off what it usually costs, and only real deals count |
| Quickly move planned meals between days and the any-day pool | Key | Built | Available in alpha.4: drag by the move handle with a mouse, pen or touch, or activate it to choose a destination. Moves and Undo appear immediately, roll back on save failure, and preserve meal details and shopping-list state. Occupied slots offer Move alongside; direct swaps remain planned ([decision](shopping-and-planning-feedback.md#rearrange-meals-after-automatic-planning)) |
| AI-ranked suggestions | Detail | Later | |

## Shopping and the pantry

| Feature | Importance | Status | Notes |
|---|---|---|---|
| A shopping list from the plan: combined, converted, pantry taken off | Headline | Built | One line per food however recipes name it (plain flour is all-purpose flour, chopped parsley is parsley, lemon wedges are lemons) and measure it (a head of garlic is ten cloves, a stick of butter half a cup, a cup of flour 120 g); names without how it's used or prepped ("to serve", "or vegetable oil", "large" on vegetables); a line naming more than one food is each of them ("salt and pepper", "½ tsp each thyme and oregano") |
| Every-week items and always-on-hand staples | Key | Built | |
| Sorted by aisle, and it remembers where things go | Key | Built | |
| A list for each place you shop | Key | Built | Lists are names and aisles, however the household sorts what it buys; the store is chosen for each thing (the two rows below) |
| Find any thing at any of your stores | Key | Built | Find on every thing on every list opens a menu of the household's stores (picked once in Settings, Household, Your stores): Fry's or Walmart's product picker, kept for that food there, or any other store's search; the extension's side panel has a Find at picker of them |
| One Send that splits the list across your stores | Key | Built | Module (stores): each thing goes to the store it's mapped to, asks when it's mapped to more than one, and the rest go to one store; then Fry's and Walmart each review and send their part |
| Shopping progress and store review on the list | Key | Built | Available in alpha.4: compact store/status menus on list rows, with product and sent-pack details inside; per-store counts and cart links on List. Review and product finding open in phone drawers; on desktop the finder replaces review in the same dialog with Back to review preserving the basket; review has fixed close/back controls, and the finder keeps search above scrolling results. Filter items needing attention or sent to a cart, mark sent purchases bought with Undo, then put away. Send snapshots flag changed quantities/products and unverified older sends; sending alone never marks food bought. |
| Complete list items after a successful store send | Key | Built | Available in alpha.4: after checkout, mark unchanged, verified sent items bought from List, with Undo; changed, unverified, failed and unsent items stay open. Sending alone never completes items or puts food in the pantry ([decision](shopping-and-planning-feedback.md#complete-list-items-after-sending-to-a-store)) |
| Contextual swaps while shopping | Key | Built | Available in alpha.4: automatic AI search across all contributing recipes and sides, one substitute choice with amounts and instructions for each recipe, manual replacements, scaled preview, durable meal recipe variants and atomic Apply/Undo. Explicit optional library edits remain available for a single recipe context. Preserves purchases and manual remainders ([decision](shopping-and-planning-feedback.md#ingredient-purpose-and-substitutions-while-shopping)) |
| Start shopping mode with screen wake and trip controls | Key | Built | Available in alpha.4: focused aisle view with a header that scrolls with the list, larger checkboxes, store focus, set aside or try another store, collapsed bought/deferred sections and a finish review. Household-scoped trip focus persists on this device; shared list and meal changes stay live ([decision](shopping-and-planning-feedback.md#start-shopping-mode)) |
| Shopping together: the list updates live on every phone | Headline | Built | |
| Recipe ingredient details on each shopping row | Detail | Built | Available in alpha.4: tap or hover the info icon for current recipe lines, scaled planned amounts, and recorded meal contributions after pantry deductions. Main dishes and sides stay identifiable; manual list edits remain separate. |
| Usual buys: "Milk? You last got some Oct 9" | Key | Built | |
| A pantry: amounts, use soon, leftovers, cooking uses it up | Headline | Built | |
| Ran out of anything? Check off what you used up after cooking | Key | Planned | With "How did it go?": the recipe's ingredients in a list, each one checked comes out of the pantry and can go on the list |
| Put away what you bought in one tap | Detail | Built | |
| Select and act on many list or pantry items | Detail | Built | |
| Fridge, freezer or cupboard | Detail | Built | Released in 0.1.0-alpha.1; storedIn on pantry items and place controls in the pantry UI |
| Receipts into the pantry: looked over, then off the list | Key | Built | AI; a photo, screenshots, a PDF or pasted text, shared from Android or an iPhone, or sent to the assistant |
| Kroger stores (Fry's, Ralphs...): products, send the cart, prices, sales | Key | Built | Module (stores), with the server admin's Kroger developer app: a store by ZIP code, one linked account for the household, Merran's pick and how many for each thing, today's price and sale, sent to the cart by barcode. Available in alpha.4: developer registration and redirect guidance in Settings |
| What the list costs, and the deals on it | Key | Built | Module (stores): each thing left on the list for Kroger priced for the packs needed (~ when how many is a guess), from the product kept for it and the last price seen; what a real deal saves under its price, and what it's for on one line under the name; each list's card says about what it comes to and what the sales save |
| Costco and any store with a search page | Detail | Built | Find any thing on its site, in the app and the extension, from the household's stores; stores by country |
| Buying by the package: the rest of a 2 lb pack goes in the pantry | Key | Built | Module (stores): what was sent to the Kroger cart is put away as the packs bought, with the meals' share set aside and the rest there to use |
| Every food known by any of its names: brands, regional names (plain flour, coriander leaves), kinds of (a green bell pepper is a bell pepper), a household's own "same as" | Key | Built | [foods.md](foods.md); one vocabulary for recipes, the list, the pantry, nutrition and the stores; 705 foods so far, with what a cup and one of each weighs, how each keeps, what the store calls it and (for 625) its USDA food; a kind covers its food at home (green bell peppers for a bell pepper); Same as and Not the same on the list |
| Fill a Walmart cart through the extension | Detail | Built | Module (stores), experimental and off until the server admin turns it on: Walmart's part of Send on the list; the extension finds each thing and fills the cart in a Walmart tab of the person's own, Merran picks a product for each and keeps every price and what Walmart had, so Change offers other brands and sizes at once; it stops at Walmart's check that it's a person for them to finish, and carries on by itself after; a setup card for the extension that ticks itself off |
| Barcode scanning | Detail | Later | |

## The assistant and AI

| Feature | Importance | Status | Notes |
|---|---|---|---|
| Bring your own AI key: Anthropic, OpenAI, Google, or OpenAI-compatible (Ollama) | Headline | Built | Available in alpha.4: provider-specific registration/key links and setup steps, with API billing and test-cost guidance |
| The server admin doesn't pay for everyone: household keys, a policy, monthly limits | Headline | Built | |
| Usage and cost by key; warnings when a key runs low | Detail | Built | |
| A suggested model for each task | Detail | Built | |
| The AI proposes, people apply: a Review queue | Key | Built | |
| A cooking assistant to chat with, that can plan and edit with your OK | Headline | Built | AI; knows the recipe or week on screen, and offers changes as cards to apply |
| Show the assistant a photo: is it done, is the sauce thick enough? | Key | Built | AI; any model that reads images; take one with a phone's camera or a computer's webcam |
| Send the assistant a recipe as a PDF or photo, and it drafts it for your library | Key | Built | AI; any model that reads PDFs or images |
| Ask what to use instead, and get a swap to use this time or save | Detail | Built | AI |
| Finding recipes online in chat | Key | Built | AI, with web search |

## Everywhere

| Feature | Importance | Status | Notes |
|---|---|---|---|
| Today: the next meal, the rest of the week, ideas for tonight | Headline | Built | |
| Made for phone, tablet and desktop | Key | Built | Not released yet: forms, confirmations and other overlays that use dialogs open as bottom drawers on phones; larger screens keep dialogs. |
| Install to the home screen | Detail | Built | |
| Three palettes, light and dark, per person | Detail | Built | |
| Settings for the server, the household and you, kept apart | Detail | Built | |
| Notifications and prep reminders: thaw the chicken, start the marinade | Key | Planned | Module |
| Works offline: recipes you've opened, this week's plan, the list | Key | Planned | |
| Guided tours, ⓘ explanations, a glossary and a Help menu | Key | Built | Available in alpha.4: core-page Driver.js tours start on first visit with remembered skip/disable choices; assistant orientation, Help replay and contextual explanations share the public glossary. Not released yet: replay waits for Help's mobile drawer to finish closing; real-device acceptance remains ([onboarding.md](onboarding.md#3-driverjs-and-help)) |
| Translations, with units, aisles, stores and currency by country | Key | Planned | |

## For developers and integrations

| Feature | Importance | Status | Notes |
|---|---|---|---|
| A documented public API (OpenAPI), with a reference page | Headline | Built | The web app uses the same API |
| API keys with permissions, one household, rate limits | Key | Built | Not released yet: key creation and the generated-key screen use a drawer on mobile, including MCP setup; larger screens use a dialog. |
| Live events stream | Detail | Built | |
| Webhooks for Home Assistant, n8n and others | Key | Planned | |
| MCP server for compatible external AI apps | Headline | Built | Not released yet: stateless /mcp with the official SDK, scoped API keys or OAuth tokens, shared assistant tools and proposals in Review. Direct plan/list application remains future work ([decision](platform.md#mcp-server)) |
| OAuth connections for MCP and REST clients | Key | Built | Not released yet: PKCE, discovery, dynamic and administrator client registration, household consent, separate resource audiences, rotating refresh tokens and connection revocation. Operator confirmed MCP OAuth and recipe proposals on TrueNAS/Dockge; REST clients and broader lifecycle checks remain. General “Sign in with Merran” is excluded ([plan](authentication.md)). |
| Household-owned API keys; OpenTelemetry; a Helm chart | Detail | Later | |

## Research candidates — October 17, 2026

These are exploratory additions from [roadmap research](roadmap-research.md), not commitments for 0.1. Existing Planned items retain their status. For this table, Later means consideration after the current planned scope, not a promise to implement.

| Feature | Importance | Status | Notes |
|---|---|---|---|
| Saved meal plans and menus | Key | Later | Exploring; Save named plans such as a busy week, camping trip, or holiday dinner and reuse them with new dates and serving counts. Goes beyond Repeat last week. |
| Prepared meals and freezer portions | Key | Later | Exploring; Track portions of food already cooked, when they were made or frozen, and schedule them without buying the original ingredients again. Goes beyond storage locations and leftover notes. |
| Meal-plan calendar subscriptions | Key | Later | Exploring; Opt in to a read-only iCalendar feed for external calendar apps, with revocable links and recipe references; refresh timing depends on the calendar app. |
| Minimum-stock reminders | Key | Later | Exploring; Set a desired stock level and review suggested top-ups based on measured pantry quantities. Complements recurring buys and staples. |
| Recipe sharing outside the household | Key | Later | Exploring; Share one recipe through a revocable read-only link without inviting the recipient to the household. Must preserve household isolation. |
| Print-friendly recipes, plans and cookbooks | Detail | Later | Exploring; Print a clean recipe, shopping list or meal plan; later assemble selected recipes into a family cookbook using print/PDF export. Complements structured data export. |
