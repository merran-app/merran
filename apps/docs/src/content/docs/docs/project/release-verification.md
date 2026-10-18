---
title: Release verification
description: What was tested on the published alpha, and what still needs real-device or external-service verification.
---

The application release **0.1.0-alpha.1** and the public documentation site are published. Publication is separate from verification of every deployment and integration. This record is dated **October 17, 2026**.

## Email development checks — October 18, 2026 (not released yet)

These checks apply to the SMTP development branch, not the published image below. Automated invitation checks passed on SQLite and Postgres, covering address matching, account creation, queued delivery, retries, expiry, cancellation, resend, concurrent duplicate prevention and the household send limit. SMTP transport was mocked; no real email was sent by those tests. The HTML templates and their wiring passed 24 focused SQLite checks, including HTML escaping and rejecting unsafe links. Invitation and test-email browser previews were inspected at desktop width and a 375px reading width. Typechecks, formatting and the documentation build/link check passed.

Real inbox rendering in mail clients, provider delivery and spam placement remain to verify. A browser preview or SMTP acceptance does not establish those results. See [email setup](../../run/configuration/#email-transport-not-released-yet) and [household invitations](../../run/household-roles/#email-an-invitation-not-released-yet).

## Tested on the published image

Tests used `ghcr.io/merran-app/merran:0.1.0-alpha.1`, digest `sha256:bd4d97da003d5b8ffbc7d55ca764e40809bebfec391a614069db0a19e1ea64ae`, on Docker Desktop's Linux AMD64 engine. They used fresh, separate data directories and synthetic accounts/recipes. No live provider keys, purchases, or household data were used.

| Check                         | Result                                                                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh SQLite installation     | Supplied Compose layout started, migrations ran, readiness passed, and first account/household setup succeeded.                                                                                           |
| Fresh Postgres installation   | Supplied Postgres 18 profile started, readiness identified Postgres, and account setup succeeded.                                                                                                         |
| Core workflow through the API | Created recipes, added pantry stock, planned a meal, generated a list with pantry deductions, checked/put away purchases, marked the meal cooked, and saved a rating/note.                                |
| SQLite restore                | A stopped app-directory archive was extracted into a separate empty directory. Login, existing API key, recipes, rating, remaining pantry stock, and a recipe image were checked; the secret matched.     |
| Postgres restore              | A custom-format `pg_dump` was restored with `pg_restore` into a separate empty database; a copied app directory retained the secret. Login, API key, recipes, and rating passed after reconnecting to it. |
| API tutorial                  | The downloadable recipe-index script returned the test recipes. Offset pagination, missing-permission rejection, and the 300-request rate-limit boundary with Retry-After were checked.                   |
| Live events                   | A recipes-only API key received a filtered `ready` event, a recipe-change event after a cooking-note write, and a new `ready` event after reconnecting.                                                   |
| Local HTTPS proxy             | Caddy 2.11.7 forwarded the homepage, readiness, and authenticated recipe requests with a verified local test-CA certificate.                                                                              |
| Extension packaging           | Both published browser archives downloaded and contained their expected manifests; Firefox's declared minimum is 128.                                                                                     |

These are smoke tests, not a complete UI acceptance suite or a backup guarantee for every installation. The core workflow was exercised through the API, not by clicking every step in the public guides. Operators should test their own backups with representative data.

## Runtime dependency hotfix — October 18, 2026

Not released yet. A local Linux amd64 image built with the shared-package dependency fix passed the final-image imports. Removing the shared package's dependency links inside a disposable container reproduced the exact `ERR_MODULE_NOT_FOUND` error for `zod` in shared telemetry. The corrected image started against isolated fresh SQLite and Postgres 18 databases; `/api/health/ready` returned HTTP 200 with the matching database kind for both. Tests used temporary storage, with no existing household data mounted. ARM64 and published-release verification remain separate.

## Installation-guide follow-up — October 18, 2026

The tabbed install guide was checked with a new app directory on Docker Desktop's Linux engine using the same **0.1.0-alpha.1** image. Readiness, the original setup-code log line, first-account/household creation, and saving a recipe passed. The account/session, recipe and original secret survived stop/start and container recreation with the same mount. The temporary container and network were removed afterward. This was an isolated fresh-data test, not a new physical machine, a different-version upgrade, or acceptance of the TrueNAS/Dockge/Portainer interfaces.

All six downloadable manager YAML files passed Compose configuration validation, along with the starter `.env` and all eight combinations of the project Compose file's optional profiles. The final examples use `:next` during alpha; the container smoke test above intentionally records the exact alpha.1 image tested. Tab navigation, remembered/synchronized platform selection, old platform bookmarks and desktop/phone layout were checked in the browser.

## Existing site review

The homepage claim/comparison audit and fixes for all 14 recorded browser-QA findings are present on main. The recorded checks covered selected mobile/tablet/desktop widths and palette/mode combinations. They did not establish universal browser, screen-reader, or real-device compatibility.

## Still to verify

- Full first-week UI walkthrough against the release, including imports from representative real websites and background-job recovery.
- ARM64 and another physical host, large-library recovery, externally managed Postgres, and stored real-provider credential recovery.
- Extension installation, approval, imports, sidebar, and updates in Chrome, Edge, and Firefox; Firefox restart behavior on a real installation.
- Android share targets and the iPhone/iPad Shortcut on devices.
- Live Kroger authorization/product/cart transfer and experimental Walmart browser automation.
- Actual nutrition, AI image/video, and server-voice requests with configured providers.
- Public DNS/ACME certificates, HTTPS session/login flows in representative proxy topologies, Cloudflare Tunnel, private VPN access, and SSE continuity through those deployments.
- Long-running external integration/reconnect behavior through proxies, accessibility/assistive technology, and broader browser coverage.

The new integration guides describe implementation and prerequisites where external verification is still pending. No unattended publication is enabled by these tests; the Pages deployment remains manual.
