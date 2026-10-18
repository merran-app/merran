# Public site implementation and backlog

Reconciled October 17, 2026 against main `f5129c9`, release `v0.1.0-alpha.1` (tag commit `d0461a5`), published assets, and the live site. Public guides live in apps/docs; this file is an internal record.

## Shipped before this refresh

- [x] Astro/Starlight site preserving the landing-page design, shared header, fonts, three palettes and light/dark settings.
- [x] Installation, account setup and first-week walkthrough.
- [x] Recipes, planning, shopping/pantry, cooking and assistant guides.
- [x] AI setup, key ownership, costs/limits, privacy and proposal approval.
- [x] Configuration, household permissions, troubleshooting, updating and backups.
- [x] Generated settings/API references, OpenAPI download, API quickstart and search.
- [x] Homepage claims/comparisons audited and workflow sections linked to guides.
- [x] All 14 recorded browser-QA findings fixed; evidence in site-browser-qa.md.
- [x] Updated demo layout and recipe photography.
- [x] Application alpha and extension archives released; https://merran.app is live (HTTP 200 checked).
- [x] CI builds and link checks; Pages publication remains manual on main.

Publication is complete. It does not certify every deployment, device or integration.

## This change: documentation delivered, not yet published

| Priority | Deliverable | Status | Remaining verification |
| --- | --- | --- | --- |
| 1 | Backlog refresh and release-verification record | Written | Keep evidence current |
| 2 | Extension download/install by browser, connection, imports, sidebar, permissions, troubleshooting | Written | Real Chrome/Edge/Firefox acceptance |
| 3 | Kroger developer setup, linking, product matching and cart transfers; experimental Walmart | Written | Live retailer accounts and carts |
| 4 | Android sharing, iPhone Shortcut, nutrition, video, AI photos, server voices | Written | Actual phones and providers |
| 5 | HTTPS/remote access, Postgres, concrete backup and restore walkthroughs | Written with scoped verification | Public DNS/ACME, proxy browser login, tunnel/VPN, external Postgres, other hosts/ARM64 |
| 6 | API permissions, pagination, errors, rate limits, SSE, runnable recipe-index script | Written; script exercised | Long-running external-client and proxy interruption tests |

## Release verification completed in this pass

- [x] Pull the actual alpha.1 image and record its digest.
- [x] Fresh SQLite and Postgres 18 Compose startup, migrations, readiness and setup.
- [x] Synthetic API workflow: recipes, plan, pantry deduction, list purchase/put-away, cooked status, rating/note.
- [x] Stopped SQLite full-directory archive and restore into separate empty directories: accounts, existing API key, recipes, rating, pantry, uploaded image and matching secret checked.
- [x] Postgres custom-format dump/restore into a separate empty database with copied app files: login, key, recipes and rating checked.
- [x] Public recipe-index example run against the release; pagination and permission rejection checked.
- [x] SSE ready permission filtering, recipe mutation event and reconnect checked; 300 requests allowed and the 301st rejected with Retry-After.
- [x] Local Caddy TLS with explicit test-CA trust: homepage, readiness and authenticated recipe requests passed.
- [x] Published Chrome/Firefox ZIPs downloaded and manifests inspected.

Evidence: site-release-verification.md and the public project/release-verification page. These replace the blanket “no fresh install/restore tested” status, not the remaining acceptance work.

## Remaining acceptance work, not missing guides

- [ ] Full first-week UI walkthrough, representative real-site imports and interrupted job recovery.
- [ ] Actual extension installation/use/update in Chrome, Edge and Firefox, including restart behavior.
- [ ] Android and iPhone/iPad share-sheet workflows on devices.
- [ ] Kroger authorization/product/cart transfer and experimental Walmart; human review before purchases.
- [ ] Live nutrition, video, image and voice provider checks; no fixed cost guarantees.
- [ ] Public certificate issuance, proxy cookie/login and streaming behavior, Cloudflare and VPN topologies.
- [ ] ARM64, another host, large libraries, external Postgres and encrypted real-provider credential recovery.
- [ ] Screen readers, Safari/Firefox site behavior, touch keyboards, zoom, measured contrast and broader page sampling.
- [ ] Long-running API clients, concurrent pagination and proxy interruption/reconnect tests.

## Additional backlog

Public roadmap added October 17, 2026 under Project, linked from the homepage footer and README. Reconciled candidates against alpha.1: fridge/freezer/cupboard already ship; offline use, prep notifications, additional sign-in, webhooks, MCP and interface translations do not. Up next reflects the chosen acceptance work above, not an invented feature order. GitHub had no issue records to link at this check; add item-specific links when tracking issues exist. Longer-term ideas remain explicitly exploratory. A follow-up [source audit](site-roadmap-audit.md) checks each public candidate, lists released capabilities separately, and splits mixed completed/planned feature rows. Remaining administration, email, onboarding, pantry follow-up and distribution work is now visible without implying that secret rotation, manual restores or the public docs are missing.

Feature overview, credits/release policy, architecture and contributor recipes can follow. Webhook/MCP guides need shipped-code verification first. An in-place SQLite-to-Postgres migration is not a verified procedure; do not advertise one.

## Validation and publication policy

### Host-manager installation examples — October 17, 2026

Optional-service follow-up: installation now covers the full project Compose profiles, persistent COMPOSE_PROFILES selection, complete per-manager Postgres + Kokoro YAML downloads, adapting those stacks to SQLite + Kokoro or Postgres-only, cloudflared in both workflows, and the settings-only module paths. Companion database/voice/update guides and .env.example point to the same procedure. Runtime defaults are unchanged. Existing SQLite data must not be described as migrated by changing DATABASE_URL. See site-platform-install-audit.md for configuration checks and the remaining real-deployment limits.

The installation page now includes copyable and downloadable SQLite Compose examples for TrueNAS Docker-based Apps, Dockge and Portainer Docker Standalone. Each makes the host storage path, numeric ownership, port mapping and first-run log access explicit. TrueNAS uses a dedicated local dataset, Dockge saves its stack before its data directory is created, and Portainer uses an absolute endpoint path. Downloads live under apps/docs/public/deploy; inline YAML must remain semantically identical to each file. These examples do not change root compose.yaml, image defaults or existing installations.

Platform instructions were compared with official TrueNAS Apps, Dockge and Portainer documentation. Compose parsing and site checks are recorded in site-platform-install-audit.md. Actual UI deployment, NAS ACL behavior and host-manager image updates still require acceptance testing; documentation does not claim that they passed.

Run docs typecheck, docs tests, Prettier on apps/docs (not internal docs), and the production build/link checker. Review new navigation and narrow layouts. Public guides describe the release, label newer behavior, and defer to the running server's schema when versions differ.

The Pages workflow still deploys only on manual dispatch with deploy=true on main. Keep that unchanged. Publication and remaining acceptance testing are separate statuses.
