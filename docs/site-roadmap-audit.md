# Roadmap source audit — October 19, 2026

Compared the public roadmap and feature inventory with v0.1.0-alpha.4 (773766d), then reconciled the documentation with the service refactor. Alpha.4 is the released functionality baseline; the subsequent service organization changes do not add capabilities. This source audit adds no runtime or provider acceptance claims. Historical smoke-test evidence remains in site-release-verification.md.

## Public candidates

| Candidate | What exists | What remains |
| --- | --- | --- |
| Offline use | apps/web/public/sw.js intercepts POST /share and temporarily caches incoming files; other requests use the network. | Offline recipe/plan/list storage and a reconnecting mutation queue. Home-screen installation is not offline support. |
| Prep reminders | Cooking timers in apps/web/src/features/cook/timers.tsx; scheduled autoplan in server services/plan. | Notification subscriptions/delivery and scheduled prep reminders; none is registered in server modules/index.ts or services/jobs/handlers.ts. |
| Passkeys, two-step sign-in, OIDC | services/auth/auth.ts enables email/password and registers openAPI, username, admin and organization plugins. | Additional authentication plugins, configuration and UI. Account table provider fields alone do not enable SSO. |
| Webhooks | http/routes/events/get.ts and services/events/events.ts implement permission-filtered SSE. | Webhook subscriptions, outbound delivery and retry handling; none is registered in the HTTP routes or job handlers. |
| MCP and external OAuth | http/routes/index.ts exposes the application's REST routes; scoped keys work today. | MCP transport/tools and external-client OAuth connection flow. The in-app assistant is not an MCP endpoint. |
| Translations | apps/web/src/i18n.ts uses i18next with only locales/en.json; units already convert. | Non-English resources/language selection and translated-import settings/flow. |
| Pantry locations | features/pantry/pantry-dialogs.tsx exposes STORAGE_PLACES; shared pantry logic handles storedIn. | Already shipped: Fridge, Freezer, Cupboard. Removed from future work. |
| After-cooking checks | cook-view.tsx marks recipes/meals cooked; recipes/cook-notes.tsx collects rating and note; services/pantry/cooking.ts deducts planned ingredients. | A separate ran-out ingredient checklist and add-to-list flow. |
| Guided onboarding | Setup recovery, household review, first-meal checklist, Driver.js tours, Help and shared glossary are implemented. | Real-device and assistive-technology acceptance; optional What's new tours. |
| SMTP | Registered email module, SMTP test, address-bound invitations and password recovery with queued delivery. | Real provider/inbox acceptance. Account email verification is excluded from self-hosted scope. |
| Administration | database/orm.ts calls migrator.up(); CLI registers rotate-secret and foods. services/secrets/rotate.ts rewraps stored secrets transactionally. | Automatic pre-migration backup, db copy command, consolidated Problems page, audit trail, and automated restore CI coverage. Encryption/rotation are already built. |
| Distribution/services | Public docs, released images/extension archives and scripted site previews exist. | Hosted application demo and Unraid template. Telemetry receiver and public totals are live. |

Paths beginning services/, http/, database/ or cli/ refer to apps/server/src; features/ refers to apps/web/src. Route/module/job registration, configured auth plugins and locale initialization were checked in addition to file searches. Longer-term exploratory candidates were retained as ideas, not release commitments.

## Corrections

- Public roadmap now has a released-capabilities section and a separate future-feature list. Acceptance checks remain Up next and link to their evidence record.
- Split docs-site completion from Unraid/demo work, secret encryption/rotation from audit logging, and completed manual restore tests from automatic backups/CI coverage in features.md.
- Moved email, onboarding, shopping substitutions/progress/mode and meal moves to released capabilities. Direct meal swaps, post-cooking pantry checks, administration and distribution additions remain planned.
- Kept incomplete offline/reminder/auth/webhook/MCP/translation items: source evidence does not support marking them built.
- Retained exact historical image versions and test environments instead of presenting old smoke tests as alpha.4 verification.

No delivery dates or new feature ordering were invented. This change does not deploy the site or certify the outstanding device/provider checks.

## Previous validation — October 17, 2026

Docs typecheck passed with zero errors, warnings or hints; the settings-generator test passed. Production build and link validation passed: 277 pages and 88,709 local links/assets. Prettier checked the public roadmap, and git diff --check passed. Existing duplicate-404 and Node url.parse build warnings remain. No application behavior changed and no live deployment was triggered.

## Reconciliation validation — October 19, 2026

Glossary and settings-reference freshness checks passed. The settings-generator test passed, and Astro check reported zero errors, warnings or hints. The production build and link check passed across 295 pages and 99,897 local links/assets. Public docs formatting and git diff --check passed. Existing duplicate-404 and Node url.parse build warnings remain. The TrueNAS/Dockge operator report is recorded separately from these checks. No application behavior or deployment changed.
