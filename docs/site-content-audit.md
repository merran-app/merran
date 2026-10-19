# Everyday guide audit — 2026-10-17

This is an internal evidence and follow-up record, not public documentation. It supplements `site-plan.md` without replacing its launch checklist.

## Scope delivered

Public task guides under `apps/docs/src/content/docs/docs/use/`: Recipes first, then Planning, Shopping and pantry, and Cooking. Each uses prerequisites, steps, expected results, limitations, troubleshooting, and next steps. Added ordered sidebar navigation, welcome/first-week links, and guide links in the four landing-page workflow sections. The assistant section links to current configuration guidance pending a dedicated AI guide.

## Evidence checked

UI labels come from `apps/web/src/locales/en.json`, cross-checked against the corresponding components and server services rather than inferred from the feature inventory.

| Area | Implementation evidence | Important qualifications |
| --- | --- | --- |
| Recipes | `features/recipes/add-recipe-dialog.tsx`, `import/from-photos.tsx`, `recipe-editor.tsx`, `ingredient-list.tsx`; server `services/recipes/import/` | Structured page imports work without AI; fallback/text/photos require AI; video also requires its module/tools. Duplicate single-link import creates a separate recipe when forced. Scaling affects recognized quantities, with multipliers when servings are absent. |
| Migration | `features/transfer/app-import-card.tsx`, `routes/_app/settings/import-export.tsx`; server `services/recipes/import/apps/` | Actual path is Import and export → From another app. Household admins can import files; direct Mealie connection also requires server-admin access. Re-import skips known recipes, not syncs edits. |
| Planning | `features/plan/add-meal-dialog.tsx`, `fill-week-dialog.tsx`; server `services/plan/suggest.ts`, `autoplan.ts` | Fill uses the library without AI. Theme matching falls back if no eligible recipe matches. Budget affects weighting, not a hard cap. Autoplan is opt-in and uses the household clock. |
| List/pantry | `features/list/add-from-plan-dialog.tsx`; server `services/pantry/stock.ts`, `put-away.ts`, `cooking.ts` | Unknown pantry amounts count as sufficient. Stock can be reserved. Checking is distinct from put-away. Household supplies/staples do not become pantry stock. Cooked plan entries cause deductions. |
| Stores | server `modules/stores/index.ts`, `settings.ts`; household labels and list controls | Module and retailer setup required; Walmart is experimental/off by default; retailer search links are not cart integrations. Handoff is not checkout. |
| Cooking | `features/cook/cook-view.tsx`, `hands-free.ts`, `timers.tsx`, `progress.ts`; server `http/routes/recipes/[recipe]/made/post.ts` | Device/browser voice dependencies; optional server TTS is separate from recognition. Progress is local for 12 hours at matching scale/pairing. Off-plan made status does not universally deduct stock. |

Paths beginning `features/` above are relative to `apps/web/src/`; server paths are relative to `apps/server/src/`.

## Release baseline

On 2026-10-17, the connected GitHub read of `https://api.github.com/repos/merran-app/merran/releases?per_page=5` returned an empty array. No published release baseline was available through that connection; local Git tags were also empty. This does not establish that a container is unavailable, nor verify any shipped image. The public guides and landing notice explicitly describe the current repository/development implementation, pending release verification. Do not call this release-verified documentation.

## Launch work still open

Validation for this pass: docs typecheck (zero errors/warnings/hints), Prettier check for `apps/docs`, and static build passed. The build produced 259 pages, built the Pagefind index, and checked 78,129 local links/assets. Existing build warnings about the duplicate 404 route and Node's `url.parse` deprecation remain. The existing preview on port 4321 was reused to inspect Recipes styling and verify sidebar navigation to Planning. This was a desktop smoke check, not the full mobile/keyboard/search launch review or a live app workflow test.

- Select an actual published release/image digest, compare the implementation at that ref with these guides, and record which newer capabilities are development-only before publishing.
- Run installation and all four workflows against a fresh instance of that release, including member/admin permissions, failed imports, file migration, and plan/list/pantry reconciliation.
- Complete the rest of the homepage claim audit: competitor comparison, AI pricing/provider matrix, deployment/security/remote-access claims, secondary feature cards, and all illustrative demo labels. The corrections in this pass do not certify the entire export.
- Write dedicated AI/provider/usage/privacy guidance and fuller integration setup pages; configuration currently provides only an overview.
- Test real-device microphone/voice, screen wake lock and timer behavior, plus retailer handoff on supported accounts. Static-site checks cannot verify those integrations.
- Complete mobile/keyboard/theme/search launch review and domain/Pages setup from `site-plan.md`.

The existing Pages deployment gate remains manual (`workflow_dispatch`, deploy input, main only). No workflow, release, or hosting change was made in this pass.

## AI setup and privacy follow-up — 2026-10-17

Added public `run/ai-setup.md`, `project/ai-privacy.md`, and `use/assistant.md`. Linked them from the sidebar, welcome/configuration/everyday guides and landing-page assistant, costs, privacy, and AI FAQ text. Removed fixed per-action marketing prices and qualified the claims that data never leaves the server and that every save requires a proposal. Existing release verification is still outstanding; this is implementation-audited documentation, not release certification.

Evidence: `apps/web/src/features/ai/`, `features/assistant/`, `features/recipes/tidy/proposal-review.tsx`, and English locale labels; `packages/shared/src/ai/{catalog,policy,resolve}.ts`; server `services/ai/`, `services/assistant/`, `services/proposals/proposals.ts`, `note-edits.ts`, `services/pantry/receipts/receipts.ts`, `services/stores/kroger/basket.ts`, `services/nutrition/`, `services/recipes/discover/discover.ts`, `services/recipes/photos/generate.ts`, `services/voice/voice.ts`, and household AI route permissions.

Important findings reflected in the guides:

- Model-list validation is followed by a potentially billable credit probe for named providers. The existing UI hint “costs nothing” is inaccurate for the whole Test and add/Test flow; this pass documents the behavior but does not change application code.
- Costs are catalog estimates; compatible/unknown model prices count as zero. Credit tests do not call the usage recorder. Limits check recorded usage before calls without reserving an atomic budget for concurrent/streamed calls; they are not strict provider billing caps.
- Named-provider model choices are the bundled catalog, not a guarantee that every listed model is accepted by an account. Compatible endpoint choices come from its reported models.
- Household keys take priority for a matching model; eligible server keys can pay after own limits, subject to policy. Fixed model choices constrain fallback. Server policy limits are per household, not a server-wide bill cap.
- Assistant context includes history/files, person/household names, tastes and optional page context. Tools can read household records without an individual approval. Hiding page context does not revoke tools or erase history.
- Proposals protect applying kitchen changes, not sending prompts or recording chat/draft data. Direct imports, media/nutrition work and background jobs have separate behavior. Stale selected recipe sections are rejected during proposal application.
- Local-model selection does not redirect dedicated external media paths or non-AI integrations. No provider retention/training guarantees or current numeric prices are asserted.

Remaining: fresh-release verification of these instructions, real provider/compatible-model capability checks, correcting the application credit-test hint, and complete integration/deployment/competitor audits. The previous dedicated AI documentation gap is now covered; fuller integration setup and real-device testing remain open.

Validation: docs typecheck completed with zero errors/warnings/hints; Prettier and `git diff --check` passed. The static build produced 262 pages, rebuilt Pagefind, and checked 79,860 local links/assets. Reused the existing port-4321 preview to inspect the AI setup page, navigation, and desktop styling. No live provider request, API key addition, release installation, or deployment was performed.

## Administrator documentation follow-up — 2026-10-17

Added `run/troubleshooting.md`, `run/household-roles.md`, and generated `run/settings-reference.md`; expanded backup/restore instructions and linked the pages through the Run Merran sidebar, welcome, configuration, recovery, and contributor guides. No app styling or release workflow was changed.

Evidence checked: server `core/{config,settings,secret}.ts`, registered `modules/settings.ts` and module definitions, `services/settings/settings.ts`, `services/households/households.ts`, `services/auth/invites.ts`, `http/middleware/auth.ts`, member/invite/import/settings routes, `services/jobs/{jobs,runner,clean-up}.ts`, `index.ts`, and `compose.yaml`; web `features/household/members-card.tsx`, `features/server/jobs-card.tsx`, and English labels. Permissions distinguish server administration, household membership/admin/ownership, and API-key route permissions. Jobs guidance distinguishes scheduled waits, retries, partial results, cancellation, and restart requeueing.

The settings generator reads TypeScript syntax and resolves source constants without executing the server or reading deployment configuration. It includes 38 public registered boot/module settings and excludes internal state. Keys, scopes, kinds, defaults, choices, environment names, and environment-only flags are generated; four description overrides avoid fixed media prices, unconditional AI fallback, and overly broad update-check privacy wording. This is a registry reference, not an exhaustive inventory of dedicated account/AI/household screens or validation schemas. Unsupported metadata expressions fail generation. Builds/dev regenerate the page; typecheck checks committed output for drift. The public-site workflow now tests the generator and watches its source dependencies; its manual deployment gate is unchanged.

Validation: generator test passed; a separate read-only comparison matched every generated metadata field against all 38 actual runtime descriptors. Docs typecheck reported zero errors/warnings/hints. Prettier and `git diff --check` passed. The build produced 265 pages, indexed search, and checked 81,693 local links/assets. Existing duplicate-404 and Node `url.parse` warnings remain. Reused the existing 4321 preview to inspect Troubleshooting and the new navigation with the shared design.

Remaining: verify fresh installation, restore (SQLite and Postgres), permissions, imports, job failure/retry, and documented workflows against a selected published release/image. No live restore, administrator mutation, provider connection, release installation, or publication was performed. Earlier integration, device, and landing-claim audit gaps remain open.

## Homepage claims, comparisons, and demos — 2026-10-17

Reviewed the complete landing HTML, generated demo text and interactions in `landing.js`, page status notice/metadata, and footer. Changes remain in the existing design; no release, deployment, or application code was changed.

### Corrections applied

| Area | Finding and correction | Evidence |
| --- | --- | --- |
| Preview identity | Removed “the app, live” and “This one works” implications. Clearly identifies scripted previews, selected local controls, sample data, illustrated food, simulated voice/AI/saves, and pending release verification. CSS food is labeled Illustration instead of AI photo. | `apps/docs/src/scripts/landing.js`; all interaction state is local, conversations/food are authored examples. |
| Origin/comparison rhetoric | Removed unsupported personal origin story and broad Mealie deficiency claims. Replaced binary “No” rows and manual-only nutrition claim with a dated, sourced comparison of documented workflows. Explicitly acknowledges Mealie AI imports, integrations, and built-in backups. Removed fabricated migration progress/counts. | Mealie official feature and AI-provider documentation, retrieved 2026-10-17 (links below); Merran import services and public guides. |
| Imports/discovery | Batch imports are sequential within a job, not three website requests at once. Removed universal import/feed accuracy and sub-minute discovery promises. | `services/recipes/import/import-links.ts`, `video/import.ts`, existing recipes guide and site/discovery services. |
| Planning | Theme preferences can fall back; options need eligible recipes. Filling a plan does not automatically list ingredients. Missed autoplan runs fill remaining days only; expired weeks are skipped. Added Any day pool and repeat-week behavior. | `services/plan/{plan,suggest,autoplan}.ts`; `features/plan/`; planning guide. |
| Store/cart examples | Replaced fake “Sent. Undo” with “Reset preview”; states real Kroger cart edits happen at retailer. Costco is a search link; Walmart experimental/setup-dependent. Store assignment is not an automatic bargain split. Prices are illustrative, not live. | `services/stores/kroger/client.ts` only adds cart products; list/store services, existing shopping guide. |
| Pantry example | Replaced incorrect rice conversion and whole-bunch deduction with directly comparable cup/tablespoon/bunch amounts. Clear measured/unmeasured reservation distinction; clear reservation tags when sample meal is cooked. Removed universal “food bought for the meal is used up” claim and fixed use-by promises. | `services/pantry/cooking.ts`, `stock.ts`, `put-away.ts`, receipt services. |
| Nutrition/cost/diet | USDA requires configuration; imported values and AI estimates are separate paths. Costs need price coverage and budget is a preference. Removed all-recipes cost availability and allergy-certainty implications. | `services/nutrition/nutrition.ts`, `services/stores/costs.ts`, shared food/diet/weight logic, AI setup guide. |
| Cooking/assistant | Voice explicitly simulated in the preview; no fake microphone listening or wake-lock promise. Fixed inconsistent lunch story, invented web-result endorsement, and stale Tastes label. Sample card alternatives without actions are disabled. | `landing.js`, `features/cook/`, assistant tools and public assistant/cooking guides. |
| Deployment/security | Removed “anything with Docker,” unsupported 512 MB minimum, and untested host-manager endorsements. Build targets AMD64/ARM64, not a verified release image. Corrected single-Docker image tag to `:next`, data path to match installation guide, persistence/restart command, separate Postgres backup, and Kokoro/tunnel prerequisites. Replaced blanket pre-login security claim with actual authorization scope. | `Dockerfile`, release build target definition, `compose.yaml`, config/auth/routes, installation/configuration guides. No workflow edits. |
| Sharing/extensions | Removed guaranteed paywall access and instant receipt-to-pantry implication. Requires page access/extension setup, HTTPS/browser support for installation, manual iPhone Shortcut setup, and AI where applicable. | `features/share/share-card.tsx`, locale instructions, share services, extension source, recipes guide. |
| License/roadmap | Removed unverifiable “always”/future-service promises and casual license interpretation. Points to license terms and public releases instead of labeling internal scope notes a public roadmap. | Repository license, footer, alpha status. |

### Implemented features newly surfaced

- Live household list/plan updates and presence: `features/live/live-updates.tsx` and event service.
- Recipe versions and restoration: `services/recipes/versions.ts` and recipe UI.
- Supported Paprika imports and household export portability (not full backup): `services/recipes/import/apps/paprika.ts`, `services/transfer/export.ts`.
- Scoped API keys and generated API reference: auth key service and API guide.
- Optional AI Tidy up review and off-by-default AI photos, with eligible provider access and variable charges: recipe review and AI-photo services/module settings.
- Any day planning and repeating last week: plan service and public planning guide.

All small-feature cards now link to relevant public guides. Unimplemented passkeys, two-step authentication, SSO, translation, barcode scanning, and offline operation are not advertised.

Comparison sources: [Mealie official features](https://mealie.io/documentation/getting-started/features/) and [Mealie AI providers](https://mealie.io/documentation/getting-started/installation/ai-providers/). These are current documentation, not proof of a particular shipped version. No competitor absence claim is inferred from silence in those docs.

Validation: typecheck reported zero errors/warnings/hints; Prettier, JavaScript syntax check, and diff whitespace check passed. Build produced 265 pages and checked 81,716 local links/assets. Existing duplicate-404 and Node URL deprecation warnings remain. Reused the existing 4321 preview: exercised cart preview/reset, pantry deduction, plan re-roll/add, and simulated voice; visually inspected the comparison layout. These are homepage checks, not live feature verification.

Remaining publication gates: choose a released Merran image/ref and verify fresh installation plus documented workflows and restores against it; real provider/retailer/extension/browser/device validation and full mobile/keyboard launch review. Static homepage demos remain intentionally simplified. Manual publication is unchanged. The previous remaining-homepage-copy audit gap is now addressed; this does not certify a released application or third-party integrations.

## Homepage style follow-up (2026-10-17)

Compared preview primitives with `apps/web/src/components/ui/{button,badge,input,card}.tsx`, recipe cards, Today glance tiles and the plan next-meal card. Existing palettes, rounded card surfaces and most controls already agree. Updated next-meal image width/minimum height, content padding, heading and badge sizes; recipe-card padding, title line height and metadata spacing; and primary/outline button hover colors to follow those components. Previews remain simplified illustrations, not release screenshots.

Replaced the eighteen-card small-features wall with three native disclosure groups: Your cookbook, Your everyday kitchen, and Make it your own. Each holds six details, with every audited limitation and documentation link preserved. Collapsed groups keep the page short; expanded content uses three, two or one columns by viewport width. Native summary controls support keyboard activation and visible focus without additional JavaScript.

Validation: all three groups expand with their guide links visible; Enter collapses a focused group. Inspected the light-mode collection layout and dark-mode hero preview in the existing local server. Typecheck passed with zero diagnostics, Prettier passed, and the build checked 81,716 links/assets across 265 pages. Existing duplicate-404 and Node URL warnings remain. Mobile breakpoints are implemented but a physical-device visual check and comparison against a running released app remain outstanding. Publication stays manual.

## Demo app-shell correction (2026-10-17)

The prior style pass did not update the obsolete shell. Rechecked `app-shell.tsx`, `app-sidebar.tsx`, `top-bar.tsx`, `bottom-nav.tsx`, `user-menu.tsx`, the sidebar primitives and recipe route grid. Removed the floating assistant bubble and standalone top-bar theme toggle. Desktop now starts with the expanded 16rem sidebar and a working collapse control; account identity sits at its foot. Phones retain bottom navigation and the top-bar account control. Appearance is available through the sample account disclosure. The optional assistant entry is in the top bar and links to the explicitly scripted assistant preview, rather than pretending to open a live chat.

Removed the overlapping hero phone mockup (cook mode remains in its dedicated feature section), exposed the full demo width, aligned recipe grid breakpoints with the route, and fixed marketing headline CSS leaking into demo page headings. Account popup contents are explicitly abbreviated preview controls, not a complete account-settings implementation.

Browser checks: all five demo navigation screens, sidebar collapse/expand, account disclosure and Escape dismissal, and the relocated assistant control. Typecheck, formatting and JavaScript syntax checks passed. This is a source-based shell comparison; released-app and physical-phone verification are still pending. No application, release workflow or publication changes.
