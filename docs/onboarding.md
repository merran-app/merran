# Setup and first-use experience

Source audit and proposed implementation plan, October 17, 2026. Requested after a fresh installation made the setup code hard to find, accepted a password without confirmation, did not offer telemetry, and provided no guided tour.

The findings below record the source baseline before implementation. The implementation section records subsequent work in this checkout, not a published release. This work does not reproduce the originally reported deployment or establish why its telemetry question was absent.

## Implementation

Implemented October 17, 2026, not released yet:

- A readiness log marker and grouped code, a restricted operator-readable setup-code file and retrieval command, restart/lockout guidance and sign-in recovery after an uncertain submission.
- Atomic first-account, credentials and household creation with serializable isolation and a per-process claim guard. Password confirmation and visibility controls cover setup, joining and changes. The operator password-reset command uses hidden prompts and revokes sessions.
- Telemetry preview before answering, a visible status-error retry, and coordination with existing dialogs and tours. Existing consent and environment precedence remain in force.
- Household time-zone/week-start/meal review; persistent, household-derived first-meal milestones; per-person dismissal and tour preferences. The old duplicate welcome instructions are replaced by recipe actions.
- Driver.js tours start automatically on the first visit to Today, Recipes, Plan, List, Pantry, recipe detail and Settings, with replay through Help. Skip/disable choices, keyboard controls, reduced motion and palette tokens are included. Cooking guidance is given before entering cook view. Help also offers assistant orientation when AI is enabled, before opening its dialog. What's new opens GitHub's latest release.
- A glossary shared between the app and generated public guide, with contextual explanations for AI key ownership, theme nights, Every week, Always on hand, Use soon, the week's pool, Goes with and proposals. Optional-module status is explicitly distinguished from a verified provider connection; existing settings/provider tests and guides remain the way to test integrations.

Remaining acceptance includes actual host-manager log viewers, real phones/tablets and screen-reader sessions. Service-specific connection diagnostics beyond the existing provider tests remain separate integration work; a configured module is never labeled connection-tested by onboarding.

## Development testing

Layout revision, October 18, 2026 (not released yet): setup uses a wider card with three paired rows on desktop (name/username, email/household, password/confirmation) and one column on phones. The setup code and collapsed help sit in a separate panel. Help expands below the code field across the panel's full width, with separately scrollable command examples on narrow screens. Password visibility controls are inside their inputs, preserving their full accessible names. The submit action and sign-in link share a compact desktop footer.

`MERRAN_DEV_SETUP=on` uses a fresh temporary SQLite database and secret each server start, ignoring the configured Postgres address and leaving the normal data directory untouched. It is rejected for production and Docker installs. It does not reopen claiming on an existing database. The temporary directory is printed at startup; a browser refresh preserves the current test, while restarting the process starts a new one. Unset the flag to return to normal data. Temporary test folders may be removed once their process is stopped; they are never server backups.

From PowerShell, set `$env:MERRAN_DEV_SETUP = 'on'`, then run `pnpm dev`. After stopping it, use `Remove-Item Env:MERRAN_DEV_SETUP`. From a Unix shell use `MERRAN_DEV_SETUP=on pnpm dev`. On an existing account, Help can restore the checklist and reset tour history without a restart.

## What existed at the audit baseline

Paths below are relative to the repository root.

| Gap | Evidence in the current implementation | Proposed change | Order |
|---|---|---|---|
| Setup code is easy to lose in startup output | `apps/server/src/index.ts` prints one ordinary info message after module startup, before listening and job initialization. The setup guide offers unfiltered logs; optional-service instructions also show combined logs. | A recognizable setup banner at readiness, an exact search marker, service-specific instructions and a way for the operator to retrieve the current code without restarting. | 1 |
| Password mistakes are accepted | `apps/web/src/features/auth/account-fields.tsx` has one masked password field, shared by setup and invite registration. `features/account/password-card.tsx` also has no new-password confirmation. | Confirm new passwords and offer an accessible show/hide control, with matching and length checks before submission. Preserve paste, autofill and password managers. | 1 |
| Telemetry can appear to have been forgotten | `features/server/telemetry-question.tsx` is mounted in `components/layout/app-shell.tsx`. `apps/server/src/modules/telemetry/question.ts` suppresses it when the receiver flag is off, an answer exists, or the setting's source is not the default. Public docs say the offer starts in alpha.2. | Diagnose the installed version and status, retain the existing consent mechanism, and make an unanswered choice visible in onboarding if the dialog fails to load. Explain environment control in Settings. | 1 |
| Household time can be wrong immediately | `apps/server/src/database/entities/households.ts` defaults to UTC and Monday. Setup passes only the household name to `services/households.ts`. Today and planning use the household's time zone. | Suggest the browser's time zone, require a visible review, and offer week-start and planned-meal preferences. Store the household choice, not a per-device override. | 2 |
| Getting started ends too soon | `apps/web/src/features/today/today-page.tsx` shows `Welcome` only while recipe count is zero. `welcome.tsx` describes three steps but tracks no completion. | A resumable household checklist: add/import a recipe, plan a meal, build a list, then open cooking. Adding one recipe must not remove the remaining guidance. | 2 |
| No guided tours or Help entry point | `apps/web/package.json`, `components/layout/top-bar.tsx` and `user-menu.tsx` have no Driver.js integration or Help menu. The full design already exists in `platform.md`. | Implement the existing design in small batches, starting with navigation, Today and the first-meal workflow. | 3 |
| Recovery instructions exceed what ships | `docs/platform.md` describes `merran reset-password`; `apps/server/src/cli/index.ts` registers only `rotate-secret` and `foods`. SMTP is still planned in `features.md`; login offers no recovery guidance. | Implement an operator password-reset command and document the supported route without SMTP. Do not imply that entering an email enables recovery emails. | 1 |
| Setup has several writes without an explicit overall transaction | `http/routes/auth/setup/post.ts` creates the account, then household, retires the code, then signs in. `services/auth/accounts.ts` separately creates the user and links credentials; request middleware only forks an entity manager. | Investigate failures and simultaneous claims; make claiming retry-safe across the auth adapter and ORM. If only sign-in fails after successful creation, direct the user to sign in. | 1 |
| Setup errors offer little recovery help | Setup's code hint only says to find the server log. Codes change on restart; twenty failures lock setup for fifteen minutes in `services/auth/setup-code.ts`. The form primarily relies on server validation. | Inline code-help instructions, restart/lockout explanations, a useful wait message, field validation and a clear retry path after connection failures. | 1 |
| Optional configuration is detached from first use | Setup immediately navigates to Today. Core-first guidance exists in `get-started/first-week.md`, while server/household settings and provider instructions are separate. | A skippable, role-aware setup review that links to the existing settings, explains which features need services, and distinguishes disabled, configured and connection-tested states. | 2 / 4 |
| Documentation tells users what to do but does not close the loop | `get-started/setup.md` has basic log/account instructions; `first-week.md` covers the meal loop. Neither provides a complete account/recovery/preferences/consent handoff. Existing installation audits explicitly leave host/device/provider acceptance outstanding. | Connect install, setup, first meal and troubleshooting with expected results and escape routes. Verify the full journey against a release candidate. | Every batch |

## Intended journey

1. Install Merran. The installation guide leads with the minimal SQLite path and links optional stacks. The operator sees when Merran is ready and can find its setup code without reading unrelated database or voice output.
2. Claim the server. Explain why the code is needed and how to find it, then create the administrator and household with password confirmation. A failed request must not strand the installation.
3. Review the household. Suggest the local time zone, review week start and which meals to plan. Keep detailed tastes, budgets, stores and provider keys skippable and available in Settings.
4. Offer the existing telemetry choice to the server administrator. Show what is sent before consent; Yes and No are clear choices. No answer leaves sending off. Environment overrides remain authoritative.
5. Offer a short introduction and a persistent checklist on Today. Users can skip the tour, return through Help, and complete one real meal without AI, stores or voice.
6. Offer optional connections and device installation when useful. Invited members get orientation to their existing household, without server configuration or a second household-creation flow.

The telemetry question remains after account creation, consistent with the October 17 decision in `operations.md`. Sequence it before an automatic tour; neither may cover another dialog. Detailed settings and tours must not become prerequisites for using recipes.

October 18, 2026: start each core-page tour automatically on its first visit, removing the launcher banner and its extra click. Wait for route/query loading, dialogs, menus and text entry to finish. The top-right close button skips the tour, without a duplicate Skip action; Don't show tours is a small link at the top, with progress and Previous/Next at the bottom. Skip or completion records that version for the person; Don't show tours disables future automatic starts. Help still replays tours, and restoring guidance resets tour history. Never automatically start a tour during cooking.

## Implementation batches and acceptance

### 1. Claiming, passwords and recovery

- Print a compact, recognizable `MERRAN SETUP CODE` banner after the server is listening, with the code grouped for reading. Keep production logging compatible with JSON consumers. Do not repeat a secret on every request or put it in a URL.
- Put log commands and the exact marker on the setup help panel and in the installation/setup guides. Include Docker, Compose, GUI log viewers and PowerShell search instructions. Distinguish Merran logs from Postgres and Kokoro logs; avoid a small tail limit that omits the startup code.
- Add an operator-only command to retrieve the running process's active code. The code is currently in memory: a separate CLI process must not generate an unrelated one. Choose a local authenticated control channel or a restricted ephemeral file as part of implementation, and remove access when setup completes. Do not expose the code through the public setup-status API. A non-default log level must not make claiming impossible.
- Add confirmation to setup, invite registration and password changes. Confirmation is a UI field and must be stripped from API request bodies. Keep server password rules authoritative and align client hints and checks with them. Add show/hide controls and associate errors/hints with their inputs; focus the first invalid field.
- Add operator password reset using the existing authentication service, with a hidden interactive prompt rather than a password in command arguments or logs. Revoke affected sessions and document exactly what the command does. Keep SMTP recovery as separate planned work.
- Verify the telemetry report with installed version, administrator status, environment overrides and `/api/telemetry/status`. `RECEIVER_LIVE` is a build-time constant, not a runtime reachability check. A temporary receiver outage should not be presented as the explanation for a missing question. Add a recoverable choice in onboarding when the status request fails; consent failure must not block core use.
- Exercise failure boundaries between user, credential, household and session creation, lost responses, duplicate submissions and concurrent claims. Design one successful initial claim across both database engines; reconcile writes across Better Auth and MikroORM rather than assuming one adapter's transaction covers both.

Done when: on SQLite and Postgres, a fresh operator finds the code using the displayed instructions, a restart invalidates the old code, wrong codes still lock out, completed setup prevents retrieval, mismatched passwords send no request, and password reset restores access without SMTP. Setup failure tests leave either a retryable fresh installation or a usable account with clear sign-in/recovery instructions. A second claimant cannot create another initial administrator. Telemetry tests cover fresh default state, Yes, No, dismissal/reopen, saved settings, environment overrides and status-request failure; no report is sent before an enabling choice or explicit operator configuration.

### 2. Household review and progress toward a meal

- Add a skippable review after claiming, reusing current household settings. Suggest the browser time zone, let the owner change it, and use a documented fallback when detection fails. Explain household-wide versus device settings, including units.
- Replace recipe-count-only onboarding with progress derived from existing household data where possible. Store dismissal and tour preferences separately from household task completion. Viewing a tour never counts as planning a meal or building a list.
- Keep progress visible after a first recipe import, including a large migration. Link each incomplete step to an action. Resume after refresh, sign-in, device changes and household switches. Hide administrative actions from members; the current household roles are owner, admin and member.
- October 18, 2026: present the four milestones as numbered cards, with a checkmark and Done for completed milestones, a progress count/bar, and Up next on the first unfinished step. All cards remain available in any order. Optional connections sit in a separate expandable panel; completing all four milestones shows a completion message.
- October 18, 2026: the optional panel uses compact Enabled/Off module tiles with one shared connection-testing explanation, followed by icon cards grouped under For your household and For your server. Server care is visible only to server administrators; recipe migration remains available to household owners/admins. Keep AI-key explanations beside the AI guide.
- Explain that the first account administers the server and owns one household; invite links bring others into that household. Invited members should not be sent through server setup.

Done when: a non-UTC household sees the correct local day after review; skipping has explicit defaults; one recipe does not erase unfinished steps; an existing household is not treated as new merely because an invited member has just joined; and a user can add a recipe, plan it, build a list and cook with every optional module off.

### 3. Driver.js and Help

- Follow `platform.md#help-and-guided-tours`: stable `data-tour` anchors, three to six steps per page, localized text, per-person versioned completion and role/module-aware steps.
- Start with navigation, Today, Recipes, Plan and List. Add Pantry, recipe detail, cooking, Settings and assistant guidance in the next increment. Offer cooking guidance before entering a cooking session or from Help; never interrupt active cooking.
- Add Help on desktop and mobile: replay this page's tour and link to relevant documentation. October 18, 2026: remove the long glossary block from Help to keep the dialog compact. Share glossary wording between contextual explanations and the public glossary rather than maintaining competing definitions.
- Persist Skip, completed tours and Don't show tours with clear semantics. One coordinator sequences consent, install guidance and tours; wait until the correct page and anchor are ready. Missing anchors should skip gracefully and be caught by checks.

Done when: a member never sees server-only steps; disabled modules produce no dead targets; replay works; preferences survive another device; and keyboard, screen-reader, reduced-motion, small-screen, light/dark and palette checks pass. Browser checks cover actual targets and dialog coordination. Run the web contrast check after adding tour colors.

### 4. Optional services and operator confidence

- Offer existing AI, store, nutrition and voice configuration through links from a setup checklist. Explain whose AI key pays, server versus household scope, and what works without a key. Avoid duplicating all settings in another form.
- Show a connection's configuration separately from a successful functional test. Choose the test, timeout and visible error for each service. Any provider test that can incur cost must be an explicit user action with its effect explained.
- Link recovery/backups, jobs, updates and HTTPS requirements from an administrator review. Give mobile users installation help when useful; do not promise offline support from home-screen installation.
- Keep backup automation, SMTP, SSO, passkeys and the consolidated Problems page in their existing feature plans. Their absence needs honest guidance now; completing all of them is not a dependency for onboarding.

Done when: optional-service failure leaves the core meal workflow usable, environment-locked settings explain where to change them, and the administrator can find backup, recovery and connection troubleshooting without searching the repository.

## Documentation and release checks

Each batch updates `features.md` and the relevant platform/operations plan. User-visible changes update `apps/web/src/locales/en.json` and the matching public guides in the same PR, marked not released until included in a release. Installation/code changes also update README, installation, troubleshooting and operations guidance; configuration or backup changes update their guides and `.env.example` when applicable.

New APIs require server OpenAPI regeneration and matching web/extension schemas. New entities require generated SQLite and Postgres migrations. Run the affected server tests, typecheck, named-file formatting and public docs build/link checks. Do not run Prettier over internal `docs/`.

Use a release-candidate acceptance matrix: SQLite and fresh Postgres; minimal and Postgres/Kokoro Compose stacks; Docker CLI and the documented TrueNAS/Dockge/Portainer log viewers; desktop and phone; first administrator and invited member. Verify clean setup, interrupted setup, restart before claiming, one complete meal, and sign-out/sign-in. Record image version and results; source review and Compose validation do not establish host-manager or real-device acceptance.

Proposed ordering is batch 1, then 2, then the first increment of 3; expand tours and optional-service guidance afterward. This prioritizes reaching a usable account, getting the household's day right, and reaching the first meal. It does not assign delivery dates or change the existing choice of Driver.js.

## Verification of this implementation

October 17, 2026: the full server suite passed 2,926 tests on SQLite and Postgres with four workers and a 30-second hook timeout. The first run alongside builds hit two unrelated Postgres fixture-start timeouts; no assertions failed, and the bounded-concurrency rerun passed. Subsequent Help tour-reset changes passed the affected onboarding, route and OpenAPI checks on both databases (1,354 tests). Migration generation reported no schema changes on either engine.

Workspace typecheck, formatting, web production build, Chrome/Edge and Firefox extension builds, generated API-type parity, palette contrast and documentation settings tests passed. The public site built 284 pages and checked 92,666 local links/assets. The glossary is generated from the web locale, and its freshness is checked with the docs typecheck.

Browser checks against an isolated temporary instance covered password mismatch, first claim, telemetry preview and declining consent, time-zone review (UTC to America/Phoenix changed Today to the correct local date), keyboard tour navigation, the phone breakpoint, hiding/restoring onboarding through Help, and the complete recipe → plan → shopping list → cooking workflow. All four milestones persisted. A process restart with MERRAN_DEV_SETUP returned the browser to fresh claiming. Temporary instances were stopped and removed; existing development servers and normal databases were preserved. These checks do not claim physical-device, screen-reader or host-manager acceptance.

October 18 automatic-tour checks used a fresh temporary SQLite instance: Today started after telemetry consent closed, Recipes started on its first visit, Don't show tours suppressed Plan's first visit, and restoring guidance waited for Help to close before starting Plan. Web typecheck, formatting, production build and the documentation build/link checks passed.
