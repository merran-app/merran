# Platform

How Merran is put together underneath the features: modules and settings, accounts and households, API keys and the public API, AI keys at the server and household level, the database, jobs, files, keeping households apart, security, languages, and help and guided tours. The features themselves are in [scope.md](scope.md) and [features.md](features.md).

## Modules: everything optional

Merran's core needs nothing but Merran itself: it runs on SQLite out of the box, or on Postgres when `DATABASE_URL` points at one. Everything that reaches outside the server, costs money or needs another container is a **module**: off until it has what it needs, and the app says what's missing instead of showing broken buttons.

| Module | What it adds | Needs | On by default? |
|---|---|---|---|
| **Core** | Accounts and households, recipes (typed in, or imported from a link's recipe data), cook view, plan, list, pantry, export and import, the API, guided tours and help | A database: SQLite (built in) or Postgres | Always |
| **AI** | The assistant, AI import (text, photos, pages without recipe data), tidy up, swaps, cooking notes into edits, Discover, receipts, AI nutrition estimates | An AI key at the server or the household (see [AI](#ai)) | When a key exists |
| **AI photos** | A photo for recipes without one, in one of four styles a household picks | An OpenAI or Google key | Off |
| **Video import** | TikTok, YouTube, Instagram and Facebook links | yt-dlp and ffmpeg (in the image), an AI key | On |
| **Nutrition** | Calculated nutrition | A USDA key (free), optionally an AI key | When a key exists |
| **Voice** | The server reads cook steps aloud, each step read once and kept | Kokoro (an optional container) or an OpenAI key | Off, unless Kokoro's address is set (the device's own voice always works) |
| **Recipe sites** | Reading recipe sites' feeds: following sites, starter collections | Nothing | On |
| **Stores** | Products, prices, sales, costs, sending a list to a store | Per store: Kroger needs a free developer app; link-only stores need nothing | Off |
| **Browser extension** | Import from any page, the list in a side panel, store carts | The extension, an API key | On |
| **Email** | Invites and password resets by email | SMTP | Off |
| **Single sign-on** | Signing in with Authentik, Authelia, Keycloak, Pocket ID, Google and the like | An OIDC provider | Off |
| **Notifications** | Prep reminders and other pushes to phones | Nothing extra (Merran makes its own push keys); HTTPS | Off |
| **Webhooks** | Telling other tools (Home Assistant, n8n) when things change | A household adding one | Off until one is added |
| **MCP server** | Compatible bearer-token AI clients reading kitchen data and proposing changes (not released yet) | A scoped API key | Available alongside the API; no AI provider required |
| **Error tracking** | Errors sent to the operator's own Sentry, GlitchTip or Bugsink | A DSN | Off |
| **Metrics** | A Prometheus `/metrics` endpoint | Nothing | Off |
| **Telemetry** | An anonymous daily summary sent to the Merran project | The server admin opting in | Off |
| **Update check** | Merran's newest release from GitHub every 6 hours, for the server admin's Update badge | Nothing | On (`MERRAN_UPDATE_CHECK=false` turns it off) |

**How a module is built.** Each module lives in its own folder and declares, in one place:
- its settings (with their environment variables), as a Zod schema
- what it makes possible (`capabilities`: `ai.chat`, `ai.vision`, `video.import`, `stores.kroger`...)
- its routes, jobs and the outside addresses it may call
- where it shows up in the web app

The web app asks `GET /api/capabilities` once at start and on changes, and draws only what's on. A household sees, say, "Photo import needs an AI key that can read images: add one in Settings → Household → AI" rather than an error.

Store connections, importers, AI providers and voices are **adapters behind interfaces**, so a contributor can add Tesco, a Paprika importer or a new voice without touching the core.

## Settings

Settings live at three levels, and each one says which level it's at:

| Level | Who changes it | Examples |
|---|---|---|
| **Server** | The server admin | Sign-up, AI keys and policy, modules, SMTP, SSO, telemetry |
| **Household** | Household admins (some, like tastes, anyone in the household) | The household's AI keys and models, meals planned, lists and stores, tastes and rules, region and currency |
| **Person** | Each person, the same in every household they're in | Appearance, language, units, notifications (and from which households), their API keys |

- **Built (October 2026):** server and household levels, the settings schema (`apps/server/src/core/settings.ts`), environment locking, secrets sealed in their own table, `GET /api/capabilities`, and Settings → This server with error tracking and telemetry. The person level arrives with its first setting.
- **Environment variables set server settings and lock them.** A setting from the environment shows in Settings as "Set on the server" and can't be changed there. Everything else can be changed in the app, so most people never edit `.env`.
- **One schema** describes every setting: its environment variable, type, default, level and help text. Startup checks it and stops with one clear list of what's wrong. The configuration reference in the docs is generated from it, so it can't drift.
- **Names:** environment variables start with `MERRAN_` (`MERRAN_SECRET`, `MERRAN_PUBLIC_URL`), except well-known ones like `DATABASE_URL`, `TZ` and provider keys (`ANTHROPIC_API_KEY`).
- **Nothing is required.** Without `DATABASE_URL`, Merran keeps a SQLite database in its data folder; with a `postgres://` address it uses Postgres. A first install has nothing to fill in.

## Accounts and households

Email implementation started October 18, 2026 (released in alpha.4): the optional `email` module owns server-level SMTP settings and a provider-independent Nodemailer sender. Email is explicitly off by default. Settings → This server → Email supports saving credentials and sending a fixed test to the signed-in server administrator's account address. Environment variables lock settings; saved passwords use the existing sealed-secret store. TLS from the start and mandatory STARTTLS both validate certificates. Trusted relays may omit both credentials; a partially configured credential pair refuses sending. Configuration readiness is not a delivery health check. Test success means the SMTP service accepted the message, not that it reached an inbox.

Resend uses the same SMTP fields as other services: `smtp.resend.com`, port 465, TLS from the start, username `resend`, API key as password, and a sender on a verified domain. The server administrator chooses the service for this installation; households do not configure their own transports. No external call happens at startup or merely by saving settings. Local relays are allowed because configuring the destination and sending tests are server-admin-only operations. The test endpoint accepts neither arbitrary message content nor an arbitrary recipient.

Local setup clarification, October 18, 2026: pnpm dev starts the API without an env-file loader; MERRAN_PUBLIC_URL must reach that process through its environment. Compose's root env_file does load .env, while the self-contained host-manager examples use inline environment values. Set the web app's origin (normally http://localhost:5173 for local development), restart the API and refresh capabilities. A local hostname must be reachable from the recipient's device; localhost links only work on the same computer. SMTP readiness and the public origin are separate prerequisites for email.invites.

Email invitations implemented October 18, 2026 (released in alpha.4): extend Merran's hashed, single-use invite links with an optional normalized recipient address rather than adding a second acceptance system through Better Auth. This changes the earlier plan: the unused Better Auth invitation table stays for compatibility, while all household invitations use Merran's join flow. New registrations are checked against the invited address before account creation; existing accounts must match too. Email invitation tokens are sealed in the secrets table for delivery and resend, so secret rotation covers them; job payloads contain only an invite id. Acceptance and cancellation delete the sealed token; daily cleanup drops expired tokens.

Household admins choose Invite by email, see pending delivery status, and can resend or cancel. A transaction creates the invitation, secret and job together. A household row lock serializes duplicate/member checks and the quota (20 queued emails or resends per hour). Resends wait at least one minute, refuse an active delivery job, reuse the link, and do not extend its seven-day expiry. Jobs retry up to three times with the runner's backoff. Expired, accepted, cancelled and superseded invitations skip queued delivery. SMTP provides at-least-once delivery: a connection loss after provider acceptance or a crash before saving sentAt can produce a duplicate message, carrying the same single-use link. Cancelling cannot recall mail already in flight. Provider acceptance is distinct from inbox delivery; no bounce tracking is implemented.

Email exposes `email.invites` and `email.passwordReset` only with ready SMTP settings and a configured MERRAN_PUBLIC_URL. Emailed links use that operator-selected HTTP(S) origin, rejecting credentials, paths, queries and fragments in the configured origin; request Host headers are never used. Existing copyable links and operator password recovery remain available.

Password recovery implemented October 18, 2026 (released in alpha.4): Forgot your password? leads to an anonymous email request. The endpoint queues identical sealed work for every address without looking up accounts, returns the same response for known/unknown addresses and unavailable SMTP, and silently suppresses recipients after three requests per 15-minute fixed window. IP limits are five requests and ten completion attempts per 15-minute window, stored atomically in the database. The worker looks up a password account and sends a styled message only when it exists. Unknown-account requests are discarded without sending. Delivery retries up to three times. Each reset token has 256 bits of randomness, only its SHA-256 hash is searchable, and its sealed delivery data participates in secret rotation. Sealed delivery is deleted after SMTP acceptance or discarding, and expired rows/secrets and old reset-rate buckets are cleared daily.

Links expire 30 minutes after requesting and carry the token in the /reset-password URL fragment so it never reaches access logs or HTTP referrers. The reset form captures the fragment in memory and removes it from the address bar, submits the token and new password only in a POST body, confirms a 10–128 character password, and never signs in automatically. Consumption and password/session changes commit in one transaction; a conditional claim prevents replay. A fingerprint of the current email and password hash invalidates links after any password change, including the CLI and Better Auth's account-settings route. Every existing session is revoked. Email recovery does not change API keys, household membership, roles, bans or emailVerified. Existing delivered links can still complete when SMTP is later disabled. Neither opening the link nor mail-client link scanning changes the password.

Email verification skipped, decided October 18, 2026: the operator chose to omit account verification for this self-hosted application. No verification emails or verified-email sign-in/signup requirement will be built in this scope. Better Auth's emailVerified column remains for schema compatibility and is not set by recovery. Invited-address restrictions still apply. Resend and other SMTP providers may separately require verification of the domain sending mail; that requirement is unchanged.

Email styling, October 18, 2026 (released in alpha.4): invitations and administrator test messages share a self-contained HTML template with Merran's cream and forest-green palette, a serif heading and inline styles on presentation tables. Invitations include a Join the household button, copyable fallback URL, household, role, invited address and expiry in UTC. Both messages retain a plain-text alternative. Household names, addresses and links are escaped for HTML; action URLs require HTTP(S) without credentials. No external fonts, images or tracking requests. Browser previews cover desktop and a 375px reading width; live inbox rendering remains provider/client acceptance work.

Built on Better Auth (see [stack.md](stack.md#better-auth-instead-of-our-own-sign-in)).

- **Households are Better Auth organizations.** A household has members with a role: **owner**, **admin** or **member**. There's always at least one owner.
- **The server admin** is whoever set the server up (Better Auth's admin plugin). They manage the server's settings, households, sign-up and the server's AI keys. Being server admin doesn't let them read another household's recipes.
- **First run:** a one-time setup code printed in the log, as in the REFERENCE app, so a stranger can't claim a fresh install.
- **Joining:** Merran's own invite links (single use, a week long, kept as a hash), optionally delivered by email and restricted to that address (released in alpha.4), or added directly by a household admin.
- **Everyone has an email address** (decided October 15, 2026): Better Auth needs one for every account, and a made-up placeholder wasn't worth the confusion. People sign in with their username or their email.
- **Open sign-up** (off by default) is planned to start a new household for each sign-up, with optional operator approval and household caps. Requiring a verified account email is skipped (October 18, 2026).
- **Signing in:**
  - a username or email and a password (always available, unless the server admin turns it off in favour of SSO)
  - **passkeys** and **two-step sign-in** (an authenticator app), each switched on by the server admin; the server admin can require two-step sign-in for admins
  - **single sign-on** with any OIDC provider, set in the environment, with a choice of whether it can create accounts or only link existing ones
- **Without email,** invites are links to copy, a household admin resets a member's password, and the server admin can reset anyone's with a command (`docker compose exec merran merran reset-password <username>`). **With configured SMTP and the public origin,** people can request their own reset link from sign-in (released in alpha.4).
- **Devices:** Settings → You lists signed-in devices, with Sign out and Sign out everywhere.
- **An audit log** for things worth knowing later: sign-ins from new devices, role changes, API keys made or revoked, AI keys added or removed, households deleted, settings changed. Household admins see their household's; the server admin sees server events.

### More than one household

A person can belong to several households (say, their own and their parents'), with a different role in each. Decided for 0.1.

- **One household at a time.** The account menu has a **household switcher**, shown only to people in more than one. The household in use is remembered per device, so the kitchen iPad can stay on one household while a phone switches.
- **What belongs to the person** follows them everywhere: their account, appearance, language and units, API keys, and notification choices.
- **What belongs to the household** stays in it: recipes, plan, list, pantry, tastes, AI keys and spend, chats, cooking notes. A person's chats in one household aren't visible from another.
- **Joining another household:** an invite link opened while signed in asks "Join the Parkers' household too?" instead of making a new account. A household admin can also invite an existing person by username or email, which they accept or decline.
- **Starting another household** is allowed when sign-up is open, or when the server admin lets that person.
- **Leaving:** anyone can leave a household (an owner must hand ownership on first, unless they're the last member, which deletes it after a warning).
- **AI spend** counts towards the household in use. Each household's AI settings decide whose key pays, as below.
- **Notifications** say which household they're for when the person is in more than one, and each person picks which households can notify them.
- **Everything with a household** says which: API keys, webhooks, the extension, the iPhone Shortcut and MCP each work in one household, chosen when they're set up.

## API keys

Authentication round, October 19, 2026: [authentication.md](authentication.md) records the agreed scope for passkeys, two-step sign-in, external OIDC and household-scoped OAuth connections for MCP and REST. The sign-in methods, credential boundary and OAuth issuance are implemented but not released; external-client and deployment acceptance remain to be verified. General “Sign in with Merran” identity-provider support is excluded.

October 19, 2026, not released yet: creating an API key, including **Use with an AI app**, opens in a drawer on mobile and a dialog on larger screens. The generated key and connection details stay in that same surface, with scrolling and phone safe-area spacing.

People make their own keys for scripts, Home Assistant, the browser extension and the iPhone Shortcut. In the REFERENCE app every key had its owner's full rights; in Merran each key says what it can do.

- **Merran's own,** not Better Auth's plugin (see [stack.md](stack.md#better-auth-instead-of-our-own-sign-in)): made and listed at `/api/auth/api-keys`, checked by the same `authenticate()` that reads session cookies.
- **Settings → You → API keys:** a name, what it may do, and when it expires (30 days, 90 days, a year, or never); it's for the household in use. The key is shown once, starts with `mrn_` (so secret scanners can spot a leaked one), and only its hash is stored. Each key shows when it was last used, and can be revoked.
- **Permissions**, read or read and write, for each area: recipes, plan, list, pantry, imports (adding recipes from links and shares), and the assistant (which spends AI money). Admin actions are never available to keys in 0.1.
- **A key acts as the person, in one household.** Leaving that household, or being removed from it, stops the key.
- **Household keys** (owned by the household, not a person, for things like a kitchen display or Home Assistant that shouldn't stop working when one person leaves) are supported by Better Auth and come after 0.1.
- **Connecting apps without copying keys:**
  - **The browser extension:** Connect opens Merran, which asks "Let the Merran extension see your recipes, plan and list?", then makes a key with just those permissions and hands it to the extension.
  - **The iPhone Shortcut:** a key that can only import (`imports: write`), made by the Share to Merran guide in Settings → You. The Shortcut shows what happened as a notification ("Added Lemon Chicken to Merran") and opens nothing. Unlike the REFERENCE app, there's no one-time sign-in link: Shortcuts get passed around with their key inside, and a key that can only share shouldn't be able to sign anyone in. So a leaked one can only add recipes.
- **The server admin** can turn API keys off, cap how long they last, and limit which permissions can be given.
- **Rate limits** per key (300 requests a minute), so a runaway script can't take the server down.
- **Routes refuse keys unless they say otherwise:** each route that a key may use names the permission it needs with `openToKeys(area, access)`, which both checks it and shows it in the API reference (as `x-merran-permission`). `GET /api/auth/api-keys/current` lets a tool check its key works.

## The public API

- **One API for everyone.** The web app, the extension and anyone's scripts use the same REST API under `/api`, so it's always complete and always tested.
- **No version in the address** (decided October 15, 2026): routes are `/api/households`, not `/api/v1/households`. Stability comes from the rule below and the spec check in CI.
- **Sign-in lives under `/api/auth`.** Better Auth's own endpoints are there (signing in and out, sessions, switching households), next to Merran's (`/api/auth/setup`, `/api/auth/me`, `/api/auth/join/{token}`). Better Auth's endpoints answer in its own error shape. The ones Merran uses are in the spec, described by Better Auth's OpenAPI plugin and then in Merran's words (`BETTER_AUTH_ENDPOINTS`).
- **The OpenAPI spec is generated** from the route definitions (`@hono/zod-openapi`), and the server shows a reference page at `/api/docs` (Scalar) with a Try it button. The docs site publishes the same.
- **Sign-in for the API:** a session cookie (the web app) or `Authorization: Bearer mrn_…` (everything else).
- **Stable within a major version.** Changes are added, not broken; anything removed is marked deprecated for at least one minor release first. CI compares the spec with the last release's and fails on an unannounced breaking change.
- **Errors** have one shape: `{ error: { code, message, fields? } }`, with stable `code`s and messages safe to show.
- **Lists are paged** with cursors, and big imports and runs return a job to follow.
- **Live updates** stay as server-sent events (`/api/events`), also open to API keys with read access.

### Webhooks

Household admins add them in Settings → Household → Webhooks, for Home Assistant, n8n and the like.

- **Events:** the plan changed, a meal was cooked or skipped, the list changed, something went in or out of the pantry, a recipe was added or changed, a bulk import finished, the weekly autoplan ran, something's due to be used soon. One event stream inside Merran feeds the live updates, webhooks and notifications, so they always agree.
- **Each webhook** has an address, the events it wants, and a secret. Deliveries are signed in the Standard Webhooks format (an HMAC of the body, a timestamp and an id), so the receiver can check they came from Merran and aren't replayed.
- **Delivery** runs on the job runner: retries with backoff for about a day, then the webhook is paused and its household admins are told. Each webhook shows its recent deliveries with their responses, and **Send a test**.
- **Payloads** carry ids and a short summary, not whole recipes, so a leaked webhook log reveals little. The receiver can fetch more through the API.
- **The home network:** Home Assistant usually lives on the same network as Merran, but letting any household make the server call local addresses is a risk on a shared server. So webhooks to private addresses are refused unless the server admin allows them (for every household, or chosen ones).

### MCP server

An MCP server at `/mcp` (Streamable HTTP, through the official MCP TypeScript SDK) lets compatible bearer-token clients work with a household's recipes, plan, list and pantry. Implemented October 19, 2026, not released yet. OAuth discovery and household consent are implemented in the authentication round, with real-client deployment acceptance still pending.

- **Signed in with an API key,** so it can do only what the key allows, in the key's household. Settings → You → API keys has a **Use with an AI app** option that makes a key and shows its endpoint and Authorization value, with instructions for Claude Code and other compatible clients.
- **The tools match the assistant's:** search and read recipes, the plan, the list and the pantry, then propose a new recipe, a recipe edit, meals or list items. The same service layer runs both.
- **The AI proposes, people apply, here too.** Changes from an outside AI become proposals in Merran's Review queue, with a link back. The first version requires review for every change. Optional direct plan/list application remains a follow-up; recipe changes always wait through MCP. Regular API keys still retain their existing REST write permissions.
- **Using the MCP server spends no Merran AI money:** the outside app's model does the thinking.
- **OAuth:** compatible remote connectors use discovery, PKCE, explicit household consent and revocable grants. MCP and REST tokens have separate audiences. This delegates Merran data access; it does not make Merran a general identity provider. See [authentication.md](authentication.md).

Assistant tool organization, decided October 19, 2026: each tool lives in its own file under `services/assistant/tools/`, with shared schemas and recipe lookup helpers. The index binds the tools to a chat and owns proposal creation; individual tools receive only the database access, household identity and proposal callback they need. Receipt scanning keeps its chat attachments and AI dependencies explicit. The shared catalog now supplies the assistant and MCP with the same schemas and executors. Receipt scanning, web import, swaps and taste changes remain assistant-specific.

MCP implementation decision, October 19, 2026: use @modelcontextprotocol/server 2.3.1 with its stateless legacy fallback and current protocol handler, one server per request, no sessions/subscriptions, and a 1 MiB body limit. Existing authentication rechecks expiry, revocation and membership and shares the key rate limit with REST. Browser Origins must match the configured public URL; cookie-only requests are refused. Tools are registered only when all their permissions are present. Recipe-only readers receive no household dietary details; those require plan:read, matching the tastes REST route. Every proposal has no chat, retains its creator, publishes a Review refresh and returns a review link. Review includes proposals without a recipe and renders the existing proposal cards for meals, lists and new recipes. REST proposal access also checks the affected area, in addition to its existing recipes permission. Public instructions mark this work unreleased; real-client and reverse-proxy acceptance is still separate from SDK integration tests.

MCP validation, October 19, 2026: 1,572 SQLite tests passed, including 14 MCP integration checks, and 60 targeted Postgres checks passed across MCP, assistant, Review and API keys. The official MCP client and a legacy handshake both connected. Server/web typechecks, web production build, generated API-client equality, formatting and the docs build/link check passed (296 pages). An isolated browser preview with synthetic data checked recipe/meal/list cards, full recipe details and the scrollable API-key form. Real external AI app installation and deployment/proxy acceptance remain to verify.

## Service ownership

Decided October 19, 2026: organize services by the feature that owns their behavior. Recipe photos (storage, generation, prompts and runs) live in `services/recipes/photos/`; imports from other apps live in `recipes/import/apps/`; video importing and its external tools live together in `recipes/import/video/`. Receipt drafts and put-away live in `pantry/receipts/`. Recipe discovery lives in `recipes/discover/`; its sites, feeds, collections and bundled data live in `recipes/discover/sites/`.

Household membership, tastes, taste formatting and clocks live in `services/households/`; theme nights remain in planning. Shared proposal creation, application, payloads and views live in `services/proposals/`, because proposals can change recipes, plans, lists and household tastes. Recipe-specific tidy-up and cooking-note suggestions remain in `recipes/review/`. Household transactions and database number conversion live in `database/transactions.ts` and `database/numbers.ts`.

Further separation, decided October 19, 2026: `stores/basket/` owns shared basket items, package quantities, product selection and price recording; `stores/kroger/` owns its client, account connection and cart workflow, and `stores/walmart/` owns the extension-backed workflow. Shared store connection creation lives in `stores/store-connections.ts`. Shared helpers require an explicit retailer. Both retailers use the same amount formatting.

Proposal text cleanup and comparison live in `proposals/`; recipe review snapshots and field details live in `recipes/review/snapshot.ts`, independent of AI tidy-up. Ordered-list comparison and comparison that ignores object-key order retain their existing semantics. Household food aliases live in `foods/aliases.ts`; list teaching retains merge/rekey orchestration. Pantry quantity helpers remain with pantry records and reservations; general amount arithmetic already lives in the shared package.

AI infrastructure stays separate from the assistant. Nutrition, planning, shopping lists, pantry stock, retailer integration, incoming shares and full data transfers retain their separate responsibilities. These moves change internal organization only: routes, persisted data, permissions and user workflows stay the same. MCP is implemented separately above; the refactor itself added no endpoint.

## AI

### Providers

| Provider | Covers |
|---|---|
| Anthropic | Claude models |
| OpenAI | GPT models, image generation, transcription, speech |
| OpenAI-compatible | Anything with an OpenAI-style API at an address you give: Ollama, LM Studio, vLLM, LiteLLM, OpenRouter, Groq, Mistral and others |
| Google | Gemini models (worth adding: a free tier and good vision) |

All through AI SDK 7, behind Merran's own thin layer.

**Models know what they can do.** Each model has abilities: structured output, tools, reading images, web search, making images, transcribing, speaking. A feature checks before it runs and says what's missing. Local models are free but vary a lot; the docs keep a short list of local models that handle recipe import well.

Settings guidance, decided October 18, 2026 (released in alpha.4): put short numbered setup instructions and official provider key-page links beside credential inputs. The shared AI-key dialog links to Claude Platform, OpenAI Platform or Google AI Studio according to the selected provider, at both household and server scope; compatible services point to Merran's setup guide. Explain separate API billing and possible credit use during key testing. USDA includes its free signup link and a reminder to check spam/junk for the key email. Kroger includes developer registration, API selection and redirect instructions. These helpers do not register accounts, configure billing or call a provider by themselves.

### AI tasks


| Task | Default size | Notes |
|---|---|---|
| Assistant | Large | Tools, and web search when the provider has it |
| Import | Large | Pages without recipe data, text, photos, videos |
| Tidy up | Large | Single recipes and library runs |
| Cooking notes into edits | Large | |
| Swaps | Small | |
| Nutrition | Small | Picking USDA matches, weighing, estimating |
| Shopping | Small | Picking store products |
| Receipts | Small | Needs images for photos |
| Discover | Small | Needs web search |
| Prep reminders | Small | Reading steps for "marinate overnight" |
| Photos | Image model | GPT Image 1 Mini or Gemini 2.5 Flash Image, on an OpenAI or Google key from whoever pays for importing |
| Transcription | Speech-to-text model | Video import without captions, on an OpenAI key from whoever pays for importing |
| Voice | Text-to-speech model | gpt-4o-mini-tts on an OpenAI key from whoever pays for the assistant, or Kokoro |

Photos, transcription and the voice aren't tasks with a model to pick: they use a fixed model from the first key of a provider that can, among the keys paying for the task named, and count towards its spend.

Every task can have its own model; otherwise it uses the default large or small model for whoever's paying.

### Whose key pays

This is the big change from the REFERENCE app, where every household used the server's keys. In Merran the person running the server doesn't have to pay for everyone they share it with.

- **Two kinds of keys:**
  - **Server keys**, added by the server admin (or set in the environment).
  - **Household keys**, added by a household's admins in Settings → Household → AI. Only that household uses them.
- **The server admin decides who may use the server's keys** (Settings → This server → AI):
  - which households: none, chosen households, or every household
  - a monthly limit for each household on the server's keys (say $5), after which it needs its own key or waits for next month
  - which tasks the server's keys cover (the small ones only, say), and which models
  - whether households may add their own keys (yes by default)
  - whether households may add their own OpenAI-compatible addresses (no by default; see below)
- **Default for a fresh install:** the server's keys cover the server admin's own household only. Every other household brings its own key, or the server admin gives it access (decided October 15, 2026).
- **For each AI call:** the household's own key for the task's model, if it has one; otherwise the server's key, if the household is allowed and under its limit; otherwise the feature is unavailable and says how to fix it. Background work (library runs, the price check's product picks) follows the same rule for the household it's working for.
- **Household AI settings** show its keys (last four characters only, with Test), its default and per-task models from what its keys can use, what it's spent by month, task and person, and an optional monthly limit on its own keys.
- **Limits are checked before a call** (from an estimate) and recorded after (from the real usage). A household near its limit gets a warning in Settings and on Today.
- **Usage** records the household, the person, the task, the model, whose key paid (server or household), tokens and cost. A model with no known price records tokens and a blank cost.

### Keeping keys safe

- **Encrypted at rest** with AES-256-GCM. Each secret gets its own data key, encrypted by the server's master key (`MERRAN_SECRET`, or a random key made on first start in the data folder). A database dump alone reveals nothing.
- **Rotating the master key:** `merran rotate-secret` (`docker exec -it merran merran rotate-secret` in Docker) seals every data key again with a new master key, in one transaction, and is safe to run twice. With the secret in the data folder it makes the new one itself; with `MERRAN_SECRET` set, it takes the new one from `MERRAN_NEW_SECRET`, and `MERRAN_SECRET` is changed to it afterwards. Each stored secret records which master key sealed it, so one sealed with a lost key shows in Settings as needing to be entered again. Changing the secret signs everyone out.
- **Never sent to the browser,** never logged (the logger redacts them), never in error reports.
- **Tested before saving** against the provider.
- **Households' own addresses are a risk.** An OpenAI-compatible address chosen by a household admin makes the server call an address someone else picked, which could be inside the server's network. So it's off by default; when the server admin allows it, private-network addresses are still refused. For a local Ollama, the server admin adds it once as a **shared endpoint** that chosen households can use.

The same encryption covers every other secret Merran stores: Kroger tokens, SMTP passwords, push keys, the USDA key.

### Other AI rules carried over

- **The AI proposes, people apply.** AI never writes to recipes, the plan, the list or the pantry directly; it makes proposals to review, as the REFERENCE app's did.
- **Prompts live in files,** versioned and tested, and ask for replies in the person's language.
- **Tests never spend money:** AI SDK's mock models and recorded responses.
- **Later:** the providers' batch APIs for library runs (half price), and a small set of real pages, photos and receipts to compare models, which helps people choosing a local model.

## Other services and their keys

| Service | Whose key | Why |
|---|---|---|
| USDA FoodData Central | Server | Free, public data, cached for every household |
| Kroger (Fry's, Ralphs, King Soopers...) | The developer app is the server's; each household links its own Kroger account | One app per server is how Kroger works |
| SMTP | Server | |
| Kokoro | Server (an address) | Runs beside Merran |
| Single sign-on | Server | |

**Stores are adapters.** A store adapter can do some of: search products, read prices and sales, add to a cart, link an account. Kroger has an official API. Walmart works through the extension in the person's own tab. **Link-only stores** (Costco, Target, Tesco, Woolworths...) are just a name, a country and a search address, so adding one is a few lines, and households pick stores from their own country.

### Stores, in the order they're built

1. **Link-only stores** (core, no module: a link costs nothing). Each store in `packages/shared/src/list/stores.ts` has its site's search, one address or one for each country whose site differs. **Find** on a thing opens the store's search in a new tab, and the extension's side panel searches the store it's set to find at in the tab beside it (part 6).
2. **Kroger** (the stores module): the server admin's Kroger developer app (`MERRAN_KROGER_CLIENT_ID` and `_SECRET`, or Settings, This server); a household's store by ZIP code, with its banner (Fry's, Ralphs...) from Kroger; one household member linking their Kroger account (OAuth with PKCE, the pending link kept in the database so a restart doesn't lose it, the tokens sealed like other secrets). Each thing on the list gets a product, picked by the small AI model from Kroger's search (a plain everyday item, a sensible size, in stock, then on sale, then the store brand), or the first in stock without AI, remembered per food (`store_products`, and never replaced once a person picked it). A review page shows each product, how many packages, the price and any sale, then **Send to Fry's** adds them to the Kroger cart: Kroger's API can only add. It's reached from **Send** on the list, with the things going to Fry's (part 6).
3. **Prices, sales and deals:** every price seen is kept by day (`store_prices`). The `stores.prices` job checks each household from 5 in the morning in its time zone, and the weekly autoplan checks first if that hasn't happened today: today's prices for the products it keeps, and up to 50 foods from its recipes looked up at the store (meat, seafood and produce first; a food not found is looked for again after 30 days, and Merran's own pick that isn't on sale after a week; always-on-hand food never). "Usually $X" is the most common price over 90 days, once seen on three days two weeks apart. Each sale is judged against that history: the lowest in a while, a normal sale, or barely off (under a tenth). Only real deals count: Fill the week and the autoplan lean on them as much as the household's **Lean on sales** says (off, a little, a lot; meat and seafood count most) and say so, and Recipes has an **On sale** filter.
4. **Buying by the package, recipe costs and a weekly budget:** what was sent to the Kroger cart is put away as the packs bought (two 1 lb packs are 2 lb), so what the meals don't use is in the pantry. A recipe's cost is each line's share of its product's price today (`GET /stores/costs`): by weight or volume, a baking staple's cups and grams by its density, a can or jar as one; it's shown when three in five of its lines have a price, on the recipe, its card, and the Plan page's week against the household's **weekly budget** (`stores.weeklyBudget`). Fill the week and the autoplan share what's left of the budget over the meals to plan, and pick recipes that fit it more and ones well over it less.
5. **Walmart through the extension** (experimental, off until the server admin turns it on: `MERRAN_WALMART`, or Settings, This server). Walmart has no way in for apps, so Merran never reaches Walmart itself: the browser extension does it in the person's own browser and hands Merran what it read. From **Send** on the list (part 6), Walmart's review is a page like Kroger's: each thing's product (the household's own pick, or Merran's from what the extension found: the small AI model's, or the first in stock), how many, and its price. The page talks to the extension through its **bridge**, a content script the extension registers only for the Merrans it's connected to (`packages/shared/src/extension/bridge.ts` has the messages; the extension's key never reaches the page, and the extension checks each call is from a connected Merran by the address the browser gives). A setup card walks through getting the extension, connecting it to the household and letting it work on walmart.com, and ticks each step off as the extension reports in. **Find them at Walmart** and **Add to the Walmart cart** run as a job in a Walmart tab beside Merran's, brought to the front while it works (a browser slows down tabs in the background) and back to Merran's when it's done, about a page a second, each used as soon as its page is in rather than once its ads are; the extension's toolbar button counts down what's left. It reads Walmart's search pages (`packages/shared/src/list/walmart.ts`) and hands Merran each thing's products as it goes (`POST /stores/walmart/found`, where every price is kept, and what Walmart had is kept with each food, so **Change** offers it at once from `GET /stores/walmart/products/{itemId}`, with a search in the Walmart tab for anything else); it adds each product from its own page with Walmart's own buttons, topping up to the count rather than adding again, and tells Merran as each goes in (`POST /stores/walmart/sent`). The page follows the job: what it's on, then what went in, what was left out and why, and **Open your Walmart cart**; checking out is the person's. When Walmart asks whether it's a person, the extension stops and the page says so, with **Show the Walmart tab**; it carries on by itself once the person's through the check in the tab (or with **Carry on**). Merran never gets past the check and never takes the person's cookies. **Stop** stops a job once it's done with the thing it's on. The job is kept in the extension's storage, so it carries on where it stopped, even when the browser stopped the extension part way.
6. **Stores on each thing, not each list.** Merran keeps products for each food at each store (`store_products`), so milk can have a Fry's product and a Walmart product; the person chooses a store for each thing, not for its list.
   - **Lists are names and aisles.** A list has no store (`shopping_lists.store` was dropped, with no data kept): a list is however the household sorts what it buys, a store, the corner shop or a party.
   - **Your stores.** The household picks the stores it shops at once, in Settings, Household, **Your stores**, from the stores for its country (`stores.yours`, a household setting). Its Kroger store and Walmart (when the server has it on, in the US) are in it by being set up. `GET /stores/yours` lists them, the ones Merran can send to first; Find and the extension offer only these, so the menus stay short however many stores Merran knows.
   - **Find, on any thing on any list.** **Find** opens a menu of your stores. Fry's or Walmart opens its product picker: Kroger's search, or what Walmart had for the food when the extension last looked, with a search in the Walmart tab for anything else. What's picked is kept for the food at that store as the household's own (`chosen`). Any other store opens its site's search in a new tab, and nothing is kept. The extension's side panel can't see which site is open beside it (that would take a permission it doesn't ask for), so it has a **Find at** picker of your stores, remembered for each household.
   - **What counts as picked.** Only the household's own: a product someone picked, or one sent to that store's cart. Merran's own picks don't count, or after a few weeks of sending to both stores everything would be picked at both.
   - **One Send, for the list showing.** **Send** opens **Send the list** (`/list/send`) for the things left on the list being looked at (`GET /stores/send-plan?list=`: for each thing, the stores it's picked at, newest first by `store_products.updatedAt`, and where it's been sent already). A thing goes to the store it's picked at; one picked at more than one goes to the newest and says so; the rest go to one store chosen at the top, starting with the one most of the list goes to, where Merran picks as it does now. Any thing can go elsewhere or be left out. Each store's part is a card with **Review Fry's** or **Review Walmart**, its basket for just those things (`?items=` on the baskets), and the card says when its part has been sent. What the person changed on the page is kept in the tab while they review each store and come back.
   - **Prices on the list** are each thing's at the store it's picked at, newest first, else at the household's Kroger store as before; each says its store.
   - **Ingredient details (October 18, 2026; released in alpha.4).** Every shopping row has an info icon, opened by tap, keyboard or hover. A lazy household-scoped `GET /list/items/{itemId}/details` resolves recorded meal shares to current recipe ingredient lines using the list's food aliases and unit compatibility, including main dishes and sides. Original wording and amounts scaled to planned servings appear together, with each meal's recorded outstanding amount after pantry deductions. Matching uses the recorded share's unit, so manual edits to the row's amount do not hide its sources. These are current recipe lines rather than historical snapshots; missing meals or recipes are counted, and manually added items can have no recipe sources. The popup fits and scrolls within the viewport without making rows taller.
   - **Shopping progress on the list (October 18, 2026; released in alpha.4).** List is the place to follow a trip through product selection, sending, buying and put-away. Each outstanding row shows its product and store, whether it needs a product or is ready, or the packs successfully sent. A compact store/status menu sits beside the name and amount; product and sent-pack details are inside it instead of extra row lines. Unsent items can be routed from that menu, including shopping for an item yourself; the store for unmatched items is chosen above the summaries. Choices use the same tab storage as the older Send page. Store summaries show sent, ready and attention counts, retailer cart links, and **Review Fry's** or **Review Walmart** opening the existing basket over the list, with product changes and partial sends retained on return. **All items**, **Needs attention** and **Sent to a cart** filter the outstanding rows. Review uses the assistant’s bottom drawer on phones and a dialog on larger screens, each with a fixed header and close/back controls, one scrolling body and no page-level bottom spacer. The product finder also uses a nested phone drawer with a fixed search field and close button above scrolling results; picking a product or closing it returns to the underlying review. On desktop, a finder opened from review takes over that same dialog through a portal into a dedicated view slot; the basket stays mounted and hidden, preserving counts, inclusion and scroll position. The header changes to the item being found, and Back to review, Escape or picking a product restores review and keyboard focus. There is one dialog and backdrop. A standalone finder still uses its own dialog. Store menus size to their contents within the viewport so longer options remain readable. Existing separate review URLs continue to work.
   - **Sending is not buying.** A successful send records the item's name and amount and the product ID, name, pack size and time in the existing `lastSent` JSON, alongside the sent pack count. Changed amounts or products, and older sends without a snapshot, ask for a retailer-cart review. Sent lines remain excluded from the next send by default, including changed lines: Kroger adds quantities rather than replacing them. Cart edits and checkout happen at the retailer; Merran does not claim to read live cart contents or know checkout completed. **Mark … sent items bought** checks only unchanged, verified sends, offers Undo, and leaves put-away as a separate action. Items can also be checked individually after reviewing substitutions. Sent pack history remains until the item leaves the list, including while checked; Kroger put-away uses the recorded pack size even if a different product has since been selected. Product changes and sends announce list updates to other devices.

## Recipe sites and starter collections

The Recipe sites module reads recipe sites' feeds in the background and keeps what it finds on one shelf. Followed sites and starter collections both come from it.

- **The shelf.** Two shared tables, as these are public pages that belong to no one: `recipe_sites` (a site and its feed) and `site_recipes` (each post Merran opened: its link, name, photo, time, course, cuisine, keywords, ingredient lines and diet labels, or that it wasn't a recipe). Two households following the same site cost it one visit. Which sites a household follows is its own (`followed_sites`).
- **Which sites are read:** the suggested sites for each language, and any site a household follows. A site no one follows that isn't suggested isn't read.
- **Being a good visitor:** Merran's own user agent; `robots.txt` followed for every background read; feeds asked for with `If-None-Match` and `If-Modified-Since`, every 6 hours per site (checked every half hour); new posts opened one at a time per site, a few seconds apart. A site that turns Merran away is left alone for a while. Posts that aren't recipes (roundups, gear, news) are remembered, so they're never opened again.
- **Photos** are fetched once through Merran, with the page as the referer (some sites need it), and kept as small WebP thumbnails, so browsing doesn't load photos from other sites.
- **A starter collection is a rule, not a list.** Each language has a data file of collections: a title, a line on what it is, a theme for Discover, a rule (courses, words in the name or keywords, words that rule one out, diets, the most minutes, months of the year), and a few hand-picked classics. A collection shows its classics and every recipe on the shelf that fits its rule, newest first, so it changes as the sites post.
- **Seasons:** a collection with months shows only in them, moved by six months for a household in the southern hemisphere.
- **Checked by itself:** the classics are opened again every week, and one that stops importing is hidden until it works again.
- **Fitted to each household:** recipes against its allergies or diets are left out (one Merran can't read counts as having every allergy), recipes in its library are marked and go last, and a collection with fewer than four left is hidden. With AI, **Find more** runs Discover with the collection's theme and keeps what it finds with the collection, for that household.
- **No calling home:** collections and suggested sites come with Merran's releases, in `apps/server/src/services/recipes/discover/sites/data/<language>/`; the server never fetches them from the Merran project.

## The database

SQLite or Postgres, with one schema defined in TypeScript (see [stack.md](stack.md#sqlite-or-postgres)).

- **Which one:** SQLite, unless `DATABASE_URL` is a Postgres address. Settings → This server shows which is in use. Postgres 16 or newer.
- **When to pick Postgres:** more than a few households, lots of people changing things at the same moment, or a Postgres you already run and back up. SQLite handles a household's day easily.
- **SQLite's one rule:** the data folder must be on a local disk, not a network share (NFS or SMB), because SQLite's locking isn't reliable over a network. Merran checks at startup and warns. It runs in WAL mode with a busy timeout, so reading never waits on a write.
- **Keeping the schema portable** (checked in review, and by running every test on both):
  - ids are UUIDv7 strings, the same on both, which also keeps export and import simple
  - money is a whole number of the smallest unit (cents) plus a currency, never a float
  - times are stored in UTC and turned into the household's time zone in code
  - JSON columns hold data that's read whole; anything filtered or sorted gets its own column
  - names compared without case (tags, foods) get a lowercase key column rather than relying on a database's collation
  - no Postgres arrays or enums: lists get their own table or go in JSON, and fixed choices are checked strings
- **Search** has one interface and two engines: Postgres full-text search with `pg_trgm` for typos, and SQLite's FTS5 with its trigram tokenizer. Both run the same test cases ("chiken thigh" finds chicken thighs).
- **Later, meaning-based search** would use `pgvector` on Postgres and `sqlite-vec` on SQLite.
- **One process.** Merran runs as one server process on either database. Several copies behind a load balancer isn't supported.

## Jobs

Merran's own job runner does everything in the background, from a `jobs` table in the database, on SQLite or Postgres (see [stack.md](stack.md#a-job-runner-of-our-own-instead-of-hand-rolled-schedules)).

| Job | When |
|---|---|
| Weekly autoplan | Each household's chosen day and time, in its time zone |
| Price check | Daily, early morning in the household's time zone, and before the autoplan |
| Reading recipe sites, followed and suggested | Every 6 hours per site, checked every half hour |
| Checking starter collections' classics | Weekly |
| Bulk imports | When started; three pages or one video at a time per household |
| Library runs: tidy up, nutrition, photos | When started; two at a time |
| Nutrition and photo for a saved recipe | After saving |
| Discover searches | When started |
| Purging Recently deleted | Daily |
| Prep reminders | Every few minutes |
| Webhook deliveries | When events happen, with retries for about a day |
| Telemetry, if opted in | Daily |
| Update check | Every 6 hours, unless turned off |

- Work in progress survives restarts. Nothing important is kept only in memory: receipt drafts, the share inbox and pending Kroger sign-ins move to the database, with an expiry, or become jobs.
- Each household gets a fair share, so one household's 500-recipe tidy-up doesn't hold up another's import.
- Settings → This server → **Jobs** shows what's running, what failed and why, with Retry and Cancel.

## Files

- **A storage interface** with two drivers: a folder (the default, `/data/files` in the container) or any S3-compatible store (MinIO, Garage, Cloudflare R2, Backblaze B2, AWS).
- **Photos** are resized to WebP with a thumbnail, and their location data (EXIF GPS) is removed on upload.
- **Served only to their household:** a file is served if one of the household's recipes uses it, as in the REFERENCE app, or through a short-lived signed address when it's on S3.

## Export and import

People own their data, and open source makes moving in and out matter more.

- **Export a household** (household admins): everything as a zip of JSON plus photos, in a documented, versioned Merran format ([export-format.md](export-format.md)). **Export a person's data** (anyone): their account, chats, cooking notes and settings.
- **Import a Merran export** into a new or existing household.
- **Import from other apps:** Mealie (from its API or a Mealie backup file, so the server needn't reach Mealie), Paprika (`.paprikarecipes`), Tandoor, and any file of schema.org recipes. More importers are welcome as adapters.
- **Deleting:** a person can delete their account; an owner can delete their household; both explain exactly what goes.

## Keeping households apart

One server hosting several households is a core promise, so isolation can't rely on remembering to add a `where`.

- **A scoped data layer.** Services get a household context, and household-owned tables are only reachable through helpers that apply it. Writing a raw query against a household table is a lint error outside that layer.
- **Every household-owned table carries `household_id`,** child tables included (ingredients, steps, versions, chat messages), so a scope can be checked on any row.
- **The isolation test is generated from the schema.** CI lists every table with `household_id` and fails if one has no test showing another household can't read, change or delete it.
- **Shared tables** are only for data that belongs to no one: USDA foods and matches, recipe sites and what was read from them, units, the model catalog.
- **Not database rules:** Postgres's row-level security could be a second lock, but SQLite has nothing like it, so the scoped layer and the generated tests are what keep households apart on both.

## Security

Carried over from the REFERENCE app, plus what a public project needs:

- **One way to fetch the internet.** Every outside request goes through one helper: no private-network addresses (unless it's an address the server admin set, like Mealie or Ollama), timeouts, size limits, and redirects checked again.
- **Merran says who it is.** The REFERENCE app fetched recipe sites dressed as Chrome (a browser user agent and cipher order) to get past bot blocks. Merran fetches with an honest `Merran/<version> (+https://merran.app)` user agent, follows `robots.txt` for background feed reads, and leaves sites that block servers to the browser extension, which imports from the person's own browser.
- **Headers:** a Content Security Policy, `frame-ancestors 'none'`, HSTS behind HTTPS, and no inline scripts beyond the theme script (hashed).
- **Behind a proxy:** a `MERRAN_TRUSTED_PROXIES` setting decides whose `X-Forwarded-For` is believed, so rate limits see real addresses and can't be dodged with a made-up header.
- **Uploads:** size limits, and file types checked from the content, not the name.
- **Rate limits** on sign-in, sign-up, invites, AI calls, imports and API keys, kept in the database so restarts don't reset them.
- **Secrets** never logged or sent to the browser; see [Keeping keys safe](#keeping-keys-safe).
- **Reporting problems:** `SECURITY.md` and GitHub's private vulnerability reporting; see [open-source.md](open-source.md#security-reports).

## Languages, units and regions

- **Each person picks** their language, units (as written, US, or metric: grams, ml and °C, converting both ways) and date and time format.
- **Each household picks** its country, currency, time zone and first day of the week. The country decides which stores, aisles and nutrition source are offered.
- **Money** is stored as an amount plus a currency, and shown with the browser's `Intl` formatting. Nothing assumes dollars.
- **Aisles** come from a list per country, and households can rename, add and reorder them.
- **Ingredient parsing** starts with English, with the units and words for other languages added as data, not code. Foods' names in each language are part of the food vocabulary ([foods.md](foods.md)).
- **The assistant** answers in the person's language.
- **Imported recipes** keep the language they were written in, for now. With translations, a setting in Settings, You has AI imports written in the person's language instead, translated, saying in the notes what language it was. Diet labels skip ingredient lines in a script they can't read rather than guessing.
- **Starter collections and suggested sites** are data files per language, open to contributions.
- **Nutrition:** USDA at first. Open Food Facts and national food databases can be added as nutrition sources later.

## Help and guided tours

Implementation status, October 17, 2026: [Setup and first-use experience](onboarding.md). Core-page tours, assistant orientation, Help replay, a shared glossary and contextual explanations are implemented and released in alpha.4. Real-device acceptance and the optional What's new tour system below remain planned. The same record covers implemented password confirmation, operator recovery, atomic claiming, household review and first-meal progress.

New people get a short tour of each page the first time they open it, and every Merran word that needs explaining has an explanation a tap away. The tours use driver.js (decided October 15, 2026; see [stack.md](stack.md#driverjs-for-guided-tours)).

October 18, 2026: core-page tours start automatically after loading and open dialogs finish. The top-right close button skips the tour, Don't show tours is a small link at the top, and Previous/Next remain at the bottom. Help can replay a tour or reset the person's tour history.

- **A tour for each main page:** Today, Recipes, a recipe, the cook view, Plan, List, Pantry, the assistant and Settings. Three to six steps each, pointing at the real thing on screen and saying what it is and why you'd use it, in plain words: "Every week: things you buy every week whatever's planned, like bananas. They go on the list with each week's plan."
- **The right tour for each person:**
  - **The server admin,** after setup: Settings → This server, step by step: AI keys and who may use them, sign-up, inviting people, backups, and where problems and updates show up.
  - **A new household's admin:** inviting people, the meals filled for the household (every meal until they turn some off in Settings → Household → Planning, which the tour points out; every meal can still be planned by hand), tastes and rules, its lists and stores, and adding its own AI key if the server doesn't cover it.
  - **Everyone else:** each page, the first time they open it.
  - The new household's "three steps to start" on Today (from the REFERENCE app) stays, and each step can open its tour.
- **Only what's there:** steps for modules that are off are skipped, so nobody's shown an AI button they don't have. A household admin may get one step instead, saying what turning it on would add.
- **Phone and desktop:** the same tour points at the bottom tabs on a phone and the sidebar on a computer. Steps find their element by a `data-tour` name, not by where it sits, and a Playwright check fails if a step's element isn't on its page.
- **Never in the way:** one tour at a time, with Skip and **Don't show tours** on every step. Never while cooking, never over a dialog, keyboard friendly (arrows and Escape), and still for people who've asked their device for less motion. The highlight and popovers use the palette's colors, light and dark.
- **Words explained:** Merran's own terms (Every week, Always on hand, Use soon, the week's pool, theme nights, Goes with, proposals and Review, whose key pays...) get a small ⓘ beside them that opens a two-line explanation. The same text makes the **Glossary** in Help and on the docs site, so each explanation is written once.
- **A Help menu** (the ? in the top bar, and in the account menu): Show me around this page, restore getting started and tours, what's new, and the docs. October 18, 2026: keep this dialog compact; glossary definitions stay in contextual explanations and the public guide.
- **What's new:** a release can include a short tour of a new feature, shown once, after the update, to the people it's for.
- **Remembered per person** in the database (which tours, at which version), so a tour seen on the phone isn't shown again on the iPad. A tour that changes a lot gets a new version and can be offered again.
- **Translated** like everything else, through i18next.
