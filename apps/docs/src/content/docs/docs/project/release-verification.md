---
title: Release verification
description: What was tested on the published alpha, and what still needs real-device or external-service verification.
---

The latest application release is **0.1.0-alpha.6**. This record was reconciled on **October 28, 2026**. The checks below retain their original dates, versions and environments: updating the guides does not establish that the alpha.5 or alpha.6 published images were tested again. Publication is separate from verification of every deployment and integration.

## Covered at home development checks — October 28, 2026 (before alpha.6)

Automated server tests cover what the list counted on at home, fully and in part; food bought for a meal left out; meals no longer on the list; a listed meal changing; cooking and its Undo; **Not at home** and its Undo; and putting used-up or lowered stock back on the list, with Undo. They passed on SQLite with the whole server suite, and the new, pantry and list tests passed on Postgres.

In a development server, a test meal was added from the plan, then **Covered at home**, the line's info popup, **Not at home** and its **Undo**, **Put on the list** after using something up or lowering **How much**, and **Choose** after using up several things were each checked in the browser, including the bottom drawer at phone width. These checks used a development build, not the published alpha.6 image.

## Operator deployment report — October 19, 2026

The operator reports running Merran on a TrueNAS server deployed through Dockge. Installation was straightforward, and everything used so far has worked. This report was provided during the alpha.4 documentation reconciliation. Exact TrueNAS/Dockge versions, image digest, database backend and individual workflows were not recorded, so it establishes practical installation and initial-use feedback rather than a full platform or integration test matrix.

## Authentication development checks — October 19, 2026 (before alpha.5)

The authentication branch adds opt-in passkeys, TOTP and recovery codes, external OIDC sign-in and OAuth access for MCP and REST. Automated SQLite and Postgres tests cover signed WebAuthn assertions with an independent virtual authenticator, required user verification and origin binding, TOTP enrollment and single-use recovery, OIDC state/nonce and explicit linking, and OAuth consent, PKCE, resource separation, refresh rotation and revocation. Provider responses and authenticator hardware are simulated; no live identity-provider account or physical passkey was used.

The full server run exercised 3,236 checks: 3,229 passed initially. Four capability expectations and one generated-schema comparison were corrected; two Postgres onboarding checks exceeded the existing five-second timeout under local load. All seven passed focused reruns without raising timeouts. A subsequent OAuth run passed 22 checks across both databases, including an additional immediate-revocation scenario. Web and Chrome/Firefox extension builds, formatting, documentation generation and local-link checks passed. The local browser preview was unavailable, so this round does not claim visual UI acceptance.

These automated checks are separate from the operator report below. Verify the configured identity provider, devices and integration lifecycle in the intended deployment before requiring alternative sign-in. See [authentication setup](../../run/authentication/).

## Operator authentication report — October 19, 2026

After deploying the merged authentication changes on TrueNAS through Dockge, the operator reported:

- Successfully connecting an external AI client to Merran through MCP OAuth.
- Receiving recipe proposals based on previous conversations and meals.
- Registering a passkey with Bitwarden, signing out, and signing back in using that passkey.

Applying the proposals and opening their review links were not explicitly confirmed. The application image digest, database backend, AI client version, browser, Bitwarden version and host versions were not recorded. This verifies the reported workflows in one deployment; at the time of the report, it did not establish a tagged release or compatibility with every client and device.

External OIDC sign-in, TOTP and recovery, hardware security keys, non-MCP REST OAuth, token refresh and revocation, and authentication persistence through restart/restore still need deployment verification.

## Email development checks — October 18, 2026

These checks ran on the SMTP development branch before release; the functionality is available in alpha.4. They do not retest the published image below. Automated invitation checks passed on SQLite and Postgres, covering address matching, account creation, queued delivery, retries, expiry, cancellation, resend, concurrent duplicate prevention and the household send limit. SMTP transport was mocked; no real email was sent by those tests. The HTML templates and their wiring passed 24 focused SQLite checks, including HTML escaping and rejecting unsafe links. Invitation and test-email browser previews were inspected at desktop width and a 375px reading width. Typechecks, formatting and the documentation build/link check passed.

Real inbox rendering in mail clients, provider delivery and spam placement remain to verify. A browser preview or SMTP acceptance does not establish those results. See [email setup](../../run/configuration/#email-transport) and [household invitations](../../run/household-roles/#email-an-invitation).

## Password-recovery follow-up — October 18, 2026

Before release, the password-reset branch added request/complete screens and styled recovery mail. Focused SQLite and Postgres tests cover generic known/unknown-account responses, sealed queued payloads, expiry, single-use and concurrent consumption, persistent request limits, session revocation, invalidation after operator/account password changes, and SMTP retry/cleanup behavior. SMTP is mocked; live provider and inbox acceptance remain separate. A disposable browser preview confirmed the request form, generic confirmation and password/confirmation fields, and that the fragment token is removed from the address bar. No real email or real-account password change was performed by that preview. Account email verification is explicitly skipped by operator decision; provider sending-domain verification remains required where applicable.

The full server regression passed 3,038 checks across SQLite and Postgres with two workers. Workspace typechecks, the web build, formatting, and the documentation build/link check passed. The initial unrestricted parallel test run exceeded existing five-second test timeouts under local load; no test timeout was increased.

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

The fix is included in alpha.4. A local Linux amd64 image built with the shared-package dependency fix passed the final-image imports. Removing the shared package's dependency links inside a disposable container reproduced the exact `ERR_MODULE_NOT_FOUND` error for `zod` in shared telemetry. The corrected image started against isolated fresh SQLite and Postgres 18 databases; `/api/health/ready` returned HTTP 200 with the matching database kind for both. Tests used temporary storage, with no existing household data mounted. ARM64 and published-release verification remain separate.

## Installation-guide follow-up — October 18, 2026

The tabbed install guide was checked with a new app directory on Docker Desktop's Linux engine using the same **0.1.0-alpha.1** image. Readiness, the original setup-code log line, first-account/household creation, and saving a recipe passed. The account/session, recipe and original secret survived stop/start and container recreation with the same mount. The temporary container and network were removed afterward. This was an isolated fresh-data test, not a new physical machine, a different-version upgrade, or acceptance of the TrueNAS/Dockge/Portainer interfaces.

All six downloadable manager YAML files passed Compose configuration validation, along with the starter `.env` and all eight combinations of the project Compose file's optional profiles. The final examples use `:next` during alpha; the container smoke test above intentionally records the exact alpha.1 image tested. Tab navigation, remembered/synchronized platform selection, old platform bookmarks and desktop/phone layout were checked in the browser.

## Existing site review

The homepage claim/comparison audit and fixes for all 14 recorded browser-QA findings are present on main. The recorded checks covered selected mobile/tablet/desktop widths and palette/mode combinations. They did not establish universal browser, screen-reader, or real-device compatibility.

## Still to verify

- Full first-week UI walkthrough against the release, including imports from representative real websites and background-job recovery.
- ARM64 and broader host coverage beyond the reported TrueNAS/Dockge installation, large-library recovery, externally managed Postgres, and stored real-provider credential recovery.
- Extension installation, approval, imports, sidebar, and updates in Chrome, Edge, and Firefox; Firefox restart behavior on a real installation.
- Android share targets and the iPhone/iPad Shortcut on devices.
- Live Kroger authorization/product/cart transfer and experimental Walmart browser automation.
- Actual nutrition, AI image/video, and server-voice requests with configured providers.
- Public DNS/ACME certificates, HTTPS session/login flows in representative proxy topologies, Cloudflare Tunnel, private VPN access, and SSE continuity through those deployments.
- Long-running external integration/reconnect behavior through proxies, accessibility/assistive technology, and broader browser coverage.

The new integration guides describe implementation and prerequisites where external verification is still pending. No unattended publication is enabled by these tests; the Pages deployment remains manual.
